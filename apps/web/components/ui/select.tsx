"use client";
import { Children, isValidElement, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

type Choice = { value: string; label: string; disabled: boolean; group?: string };
function text(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child)).join("");
}
function choices(children: ReactNode, group?: string, disabled = false): Choice[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }>(child)) return [];
    if (child.type === "option") return [{ value: String(child.props.value ?? text(child.props.children)), label: child.props.label || text(child.props.children), disabled: disabled || !!child.props.disabled, group }];
    return choices(child.props.children, child.type === "optgroup" ? child.props.label : group, disabled || !!child.props.disabled);
  });
}
const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();

// The native select remains the form control: FormData, validation, reset,
// controlled onChange handlers and existing automation keep their semantics.
export function Select({ children, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  const native = useRef<HTMLSelectElement>(null), trigger = useRef<HTMLDivElement>(null), popup = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const [enhanced, setEnhanced] = useState(false), [open, setOpen] = useState(false), [invalid, setInvalid] = useState(false);
  const [value, setValue] = useState(String(props.defaultValue ?? choices(children)[0]?.value ?? "")), [label, setLabel] = useState("Chọn lựa chọn");
  const [query, setQuery] = useState(""), [active, setActive] = useState(0);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 240, maxHeight: 320 });
  const options = choices(children), current = String(props.value ?? value);
  const selected = options.find(option => option.value === current);
  const filtered = options.filter(option => fold(option.label).includes(fold(query)));
  const searchable = options.length > 7;
  const typeahead = useRef({ value: "", at: 0 });

  useEffect(() => {
    setEnhanced(true);
    setValue(native.current?.value || "");
    const owner = native.current?.labels?.[0];
    if (owner) {
      const clone = owner.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".ui-select,small,.field-error").forEach(node => node.remove());
      setLabel(clone.textContent?.trim() || "Chọn lựa chọn");
    }
    const form = native.current?.form;
    const reset = () => queueMicrotask(() => { setValue(native.current?.value || ""); setInvalid(false); setOpen(false); });
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  useEffect(() => { if (props.value === undefined) setValue(native.current?.value || ""); }, [children, props.value]);
  useEffect(() => {
    if (!open) return;
    popup.current?.showPopover?.();
    search.current?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !popup.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    const resize = () => setOpen(false);
    let frame = 0;
    const scroll = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(positionPopup);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", scroll, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", resize); window.removeEventListener("scroll", scroll, true); };
  }, [open]);
  useEffect(() => { popup.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  function positionPopup() {
    if (!trigger.current) return;
    const rect = trigger.current.getBoundingClientRect(), width = Math.min(Math.max(rect.width, 220), innerWidth - 24);
    const below = innerHeight - rect.bottom - 16, above = rect.top - 16;
    const maxHeight = Math.max(120, Math.min(330, Math.max(below, above)));
    const next = { left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)), top: below >= Math.min(260, maxHeight) ? rect.bottom + 6 : Math.max(12, rect.top - maxHeight - 6), width, maxHeight };
    setPosition(previous => previous.left === next.left && previous.top === next.top && previous.width === next.width && previous.maxHeight === next.maxHeight ? previous : next);
  }
  function show() {
    if (props.disabled || !enhanced || !trigger.current) return;
    positionPopup();
    setHost(native.current?.closest("dialog") || document.body);
    setQuery("");
    setActive(Math.max(0, options.findIndex(option => option.value === current && !option.disabled)));
    setOpen(true);
  }
  function choose(option: Choice) {
    if (option.disabled || !native.current) return;
    native.current.value = option.value;
    native.current.dispatchEvent(new Event("change", { bubbles: true }));
    setOpen(false);
    trigger.current?.focus();
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    if (event.key === "Tab") { setOpen(false); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(); return; }
      const enabled = filtered.map((item, i) => item.disabled ? -1 : i).filter(i => i >= 0);
      const index = enabled.indexOf(active);
      const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
      if (enabled.length) setActive(enabled[next]);
    } else if (event.key === "Enter" || (event.key === " " && event.target !== search.current)) {
      event.preventDefault();
      if (!open) show(); else if (filtered[active]) choose(filtered[active]);
    } else if (event.key.length === 1 && event.target !== search.current && !event.ctrlKey && !event.metaKey) {
      const now = Date.now();
      typeahead.current = { value: now - typeahead.current.at > 700 ? event.key : typeahead.current.value + event.key, at: now };
      const match = options.find(option => !option.disabled && fold(option.label).startsWith(fold(typeahead.current.value)));
      if (match) choose(match);
    }
  }
  const name = props["aria-label"] || label;
  return <span className={`ui-select ${className}`} data-enhanced={enhanced} data-open={open} data-disabled={!!props.disabled || !enhanced} data-invalid={invalid || props["aria-invalid"] === true || props["aria-invalid"] === "true"}>
    <select {...props} ref={native} className="ui-select-native" tabIndex={-1} aria-hidden="true"
      onFocus={event => { if (enhanced) trigger.current?.focus(); props.onFocus?.(event); }}
      onInvalid={event => { if (enhanced) { event.preventDefault(); setInvalid(true); trigger.current?.focus(); } props.onInvalid?.(event); }}
      onChange={event => { setValue(event.currentTarget.value); setInvalid(false); props.onChange?.(event); }}>{children}</select>
    <span ref={trigger} className="ui-select-trigger" role="combobox" tabIndex={props.disabled || !enhanced ? -1 : 0} aria-label={name} aria-labelledby={props["aria-labelledby"]} aria-describedby={props["aria-describedby"]} aria-expanded={open} aria-controls={`${id}-list`} aria-haspopup="listbox" aria-disabled={props.disabled || !enhanced} aria-required={props.required} aria-invalid={invalid || props["aria-invalid"]} aria-activedescendant={open && filtered[active] ? `${id}-option-${active}` : undefined}
      onClick={event => { event.preventDefault(); if (open) setOpen(false); else show(); }} onKeyDown={keyboard}>
      <span className="ui-select-value">{selected?.label || "Chọn lựa chọn"}</span><ChevronDown size={16} aria-hidden="true" />
    </span>
    {open && host && createPortal(<div ref={popup} popover="auto" className="ui-select-popup" style={position} onToggle={event => { if (event.newState === "closed") setOpen(false); }}>
      {searchable && <div className="ui-select-search"><Search size={16} aria-hidden="true" /><input ref={search} type="search" value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={keyboard} aria-label={`Tìm trong ${name}`} aria-controls={`${id}-list`} aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined} placeholder="Tìm lựa chọn…" autoComplete="off" /></div>}
      <div id={`${id}-list`} role="listbox" aria-label={name} className="ui-select-options">
        {filtered.map((option, index) => <div key={`${option.value}:${index}`} id={`${id}-option-${index}`} role="option" aria-selected={current === option.value} aria-disabled={option.disabled} data-index={index} data-active={active === index} onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(option)} className="ui-select-option"><span>{option.group && <small>{option.group}</small>}{option.label}</span>{current === option.value && <Check size={16} aria-hidden="true" />}</div>)}
        {!filtered.length && <p className="ui-select-no-results" role="status">Không tìm thấy lựa chọn.</p>}
      </div>
    </div>, host)}
  </span>;
}

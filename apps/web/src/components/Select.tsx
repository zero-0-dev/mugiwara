import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useMobileLayout } from "../hooks/useMobileLayout";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface DropdownPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
  disabled = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<DropdownPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobileLayout();

  const selectedOption = options.find((o) => o.value === value);

  const open = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      setPosition({ left: 8, width: 200 });
      setIsOpen(true);
      return;
    }
    const width = Math.min(Math.max(rect.width, 180), Math.max(180, window.innerWidth - 16));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow < 260 && spaceAbove > spaceBelow) {
      setPosition({ bottom: window.innerHeight - rect.top + 4, left, width });
    } else {
      setPosition({ top: rect.bottom + 4, left, width });
    }
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleClickOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    const close = () => setIsOpen(false);
    const handleScroll = (event: Event) => {
      if (dropdownRef.current?.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  const dropdownStyle = {
    "--dropdown-top": position?.top !== undefined ? `${position.top}px` : "auto",
    "--dropdown-left": `${position?.left ?? 0}px`,
    "--dropdown-width": `${position?.width ?? 180}px`,
    "--dropdown-bottom": position?.bottom !== undefined ? `${position.bottom}px` : "auto",
  } as CSSProperties;

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      className={`select-dropdown${isMobile ? " sheet" : ""}`}
      style={dropdownStyle}
      role="listbox"
      aria-label={placeholder}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          className={`select-option${option.value === value ? " selected" : ""}`}
          onClick={() => {
            onChange(option.value);
            setIsOpen(false);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className={`select-container ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="select-label">
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown size={16} className="select-chevron" />
      </button>
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}

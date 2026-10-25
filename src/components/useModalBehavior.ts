import { useEffect, useRef } from "react";

/**
 * Shared modal behavior: locks page scrolling while open, and closes on Escape
 * unless `busy` is true (a request is in flight).
 */
export function useModalBehavior(onClose: () => void, busy: boolean): void {
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}

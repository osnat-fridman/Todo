import { useOnline } from "../lib/useOnline";

/** A fixed message under the menu, on both pages, while there is no connection (PRD UI Texts). */
export default function OfflineNotice() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-notice" role="status">
      <p className="error-box">אין חיבור לאינטרנט. לא ניתן לצפות במשימות או לשנות אותן עד שהחיבור יחזור.</p>
    </div>
  );
}

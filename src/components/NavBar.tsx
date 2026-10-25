import { NavLink } from "react-router";

export default function NavBar() {
  return (
    <header className="site-header">
      <nav className="nav" aria-label="ניווט ראשי">
        <NavLink to="/" end className="nav-link">
          דף הבית
        </NavLink>
        <NavLink to="/about" className="nav-link">
          אודות
        </NavLink>
      </nav>
    </header>
  );
}

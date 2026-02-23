// src/pages/ResumePage.jsx
import "../../css/pages/ResumePage.css";
import { RESUME_PAGE_COPY } from "../content/resumepage.content.ts";

export default function ResumePage() {
  const c = RESUME_PAGE_COPY;

  return (
    <div className="resume-container">
      <header className="resume-header">
        <h1 className="resume-eyebrow">{c.header.eyebrow}</h1>
        <h1 className="resume-name">{c.header.name}</h1>
        <p className="resume-tagline">{c.header.tagline}</p>
      </header>

      <section className="resume-section">
        <h2>{c.sections.experience.title}</h2>
        <ul>
          {c.sections.experience.items.map((item) => (
            <li key={item.role}>
              <strong>{item.role}</strong>
              <br />
              {item.description}
            </li>
          ))}
        </ul>
      </section>

      <section className="resume-section">
        <h2>{c.sections.skills.title}</h2>
        <p>{c.sections.skills.list}</p>
      </section>

      <section className="resume-section">
        <h2>{c.sections.education.title}</h2>
        <p>{c.sections.education.detail}</p>
      </section>
    </div>
  );
}

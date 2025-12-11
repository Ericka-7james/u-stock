// src/pages/ResumePage.jsx
import "./ResumePage.css";

export default function ResumePage() {
  return (
    <div className="resume-container">
      <header className="resume-header">
        <h1>Ericka James</h1>
        <p>Software Engineer • FinTech • AI/ML • Full-Stack Developer</p>
      </header>

      <section className="resume-section">
        <h2>Experience</h2>
        <ul>
          <li>
            <strong>Software Engineer – U-Stock Intelligence Platform</strong><br />
            Built end-to-end financial analytics & automated trading platform using  
            React, FastAPI, Python, and cloud services.
          </li>
          <li>
            <strong>Software Engineer – JPMorgan Chase</strong><br />
            Delivered front-end features, automation tooling, and design systems across
            payments infrastructure.
          </li>
        </ul>
      </section>

      <section className="resume-section">
        <h2>Skills</h2>
        <p>React · TypeScript · Python · FastAPI · SQL · Cloud Architecture · Data Engineering</p>
      </section>

      <section className="resume-section">
        <h2>Education</h2>
        <p>Spelman College — B.S. Computer Science, 2025</p>
      </section>
    </div>
  );
}

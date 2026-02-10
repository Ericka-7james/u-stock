// src/content/resumepage.content.ts
export const RESUME_PAGE_COPY = {
  header: {
    eyebrow: "LinkedIn · Fullstack Lab",
    name: "Ericka James",
    tagline: "Software Engineer • FinTech • AI/ML • Full-Stack Developer",
  },

  sections: {
    experience: {
      title: "Experience",
      items: [
        {
          role: "Software Engineer – U-Stock Intelligence Platform",
          description:
            "Built end-to-end financial analytics & automated trading platform using React, FastAPI, Python, and cloud services.",
        },
        {
          role: "Software Engineer – JPMorgan Chase",
          description:
            "Delivered front-end features, automation tooling, and design systems across payments infrastructure.",
        },
      ],
    },

    skills: {
      title: "Skills",
      list: "React · TypeScript · Python · FastAPI · SQL · Cloud Architecture · Data Engineering",
    },

    education: {
      title: "Education",
      detail: "Spelman College — B.S. Computer Science, 2025",
    },
  },
} as const;

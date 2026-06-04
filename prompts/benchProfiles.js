const benchProfiles = {
  easy: {
    title: "Lenient Appellate Bench",
    questions: "5–10",
    interruption: "Low",
    aggression: "Low",
    focus: "Basic Jurisdiction · Core Statutory Definitions · Standard Grounds of Appeal",
    duration: "10 mins",
    judges: [
      {
        name: "Justice Sen",
        ideology: "The Mentor",
        behavior: "Encouraging, focuses on basic maintainability. Wants to see clean framing and understanding of fundamental legal principles."
      },
      {
        name: "Justice Patil",
        ideology: "Procedural Formalist",
        behavior: "Patient but expects standard court procedures to be followed. Focuses on the factual timeline and record of the lower courts."
      }
    ]
  },
  moderate: {
    title: "Moderate Constitutional Bench",
    questions: "15–20",
    interruption: "Medium",
    aggression: "High",
    focus: "Privacy · Proportionality · Due Process · Algorithmic Accountability",
    duration: "20 mins",
    judges: [
      {
        name: "Chief Justice Rao",
        ideology: "Constitutional Purist",
        behavior: "Focuses on the letter of the constitution and proportionality. Probes how reading down a clause matches state interest."
      },
      {
        name: "Justice Menon",
        ideology: "Procedural Hawk",
        behavior: "Zero tolerance for missed deadlines or incorrect appeal procedures. Queries locus standi and legislative intent."
      },
      {
        name: "Justice Iyer",
        ideology: "Rights-Oriented",
        behavior: "Focuses on equity, fairness, and human rights. Interested in public interest impact and natural justice."
      }
    ]
  },
  hard: {
    title: "Hostile Full Constitutional Bench",
    questions: "25–30",
    interruption: "High",
    aggression: "Extreme",
    focus: "Manifest Arbitrariness · Standard of Review · Separation of Powers · Deep Precedential Inconsistencies",
    duration: "35 mins",
    judges: [
      {
        name: "Chief Justice Rao",
        ideology: "Constitutional Purist",
        behavior: "Focuses on separation of powers and judicial restraint. Hostile to arguments suggesting policy decisions should be second-guessed."
      },
      {
        name: "Justice Menon",
        ideology: "Procedural Hawk",
        behavior: "Intense, Socratic questioning. Probes jurisdictional boundaries and constitutional maintainability gates."
      },
      {
        name: "Justice Iyer",
        ideology: "Rights-Oriented",
        behavior: "Extremely analytical about systemic impacts. Probes proportionate measures and checks whether a lesser-restrictive alternative exists."
      }
    ]
  }
};

module.exports = benchProfiles;

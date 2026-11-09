/**
 * Outreach & delivery playbook — transcribed from the Excalidraw board
 * (persona research notes + market-as positioning + role assignments).
 */

export const PERSONAS = [
  {
    key: "dreamer",
    label: "The Dreamer",
    color: "#c792ea",
    who: "Forward towards full automation; wowed by the idea of a Jarvis-like supercomputer. Draw them a vivid picture.",
    market_as: "A supercomputer that takes care of deployment for you.",
    region_hint: "Morning — India",
  },
  {
    key: "enthusiast",
    label: "The Enthusiast",
    color: "#5ad19b",
    who: "AI-forward but slightly skeptical of Lear — lacks knowledge or trust. Doesn't want an agent doing everything; wants something that actually helps with the infra.",
    market_as: "An AI copilot that handles errors for you.",
    region_hint: "Afternoon — EMEA",
  },
  {
    key: "pessimistic",
    label: "The Pessimistic",
    color: "#6aa8ff",
    who: "Doesn't care for AI, doesn't trust AI code in their codebase, busy or classical thinkers. To them Lear is just an email bot giving its opinion on an outage.",
    market_as: "A diagnosis agent that saves hours of RCA and slog work — and saves engineering hours.",
    region_hint: "Night — Americas",
  },
];

export const ROLES = [
  { role: "Project Manager", holders: "CEO, COO" },
  { role: "Project Lead", holders: "CTO, HoE" },
  { role: "Q/A", holders: "Avi or Agrim" },
  { role: "Development", holders: "Aryan or Agrim" },
];

export const COMMS_PROTOCOL = [
  "Email acts as the interface with the client, run by the PM together with the Dev Lead (if needed) — help the client understand the product, follow up, send the build.",
  "#passive — continuous passive feedback taken around the product.",
  "#active — legal, MoUs and contracts handled with each client.",
  "If the client wants it: weekly status meetings with the project manager (HoE or Me) regarding updates.",
  "Windows: Morning — India · Afternoon — EMEA · Night — Americas.",
];

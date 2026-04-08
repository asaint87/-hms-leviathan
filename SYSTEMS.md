# HMS Leviathan — Systems Bible
## Core Interaction Archetypes

> 5 stations. 5 reusable components. 12 missions. One cooperative loop.

---

## Design Principle

Every mission in HMS Leviathan uses the **same 5 UI components** — reskinned with new context and stakes per mission. You are not building 60 mini-games. You are building 5 components that scale across 3 acts.

**This is how a small team ships a real game.**

---

## The 5 Archetypes

---

## 1. Sonar — Frequency Tuning

**Station Identity:** The ears of the ship. The crew is blind without Sonar.

### Base UI Mechanic
- Horizontal frequency dial (drag or swipe)
- Visual waveform + noise overlay
- Player aligns frequency to "clean" signal peak
- Optional second layer: pattern matching (stacked waves or symbols)

**Core Loop:** `Scan → Adjust → Lock Signal`

### Difficulty Scaling

| Act | Conditions |
|---|---|
| **Act 1** | Wide correct zone. Minimal noise. Single frequency band. Visual cues obvious (highlighted peaks). |
| **Act 2** | Narrower target window. Multiple overlapping signals. Intermittent interference — signal drops out. Requires switching between bands. |
| **Act 3** | Moving target frequencies. Hidden signals — no visual peak, must infer. Multi-step sequences (lock A → B → C in order). Time pressure + system instability. |

### Failure States
| Failure | Consequence |
|---|---|
| Lose signal lock | Team loses visibility — map blanks, targeting fails |
| Misalignment | False readings — phantom objects, wrong direction data |
| Critical moment failure | Signal destabilizes entire system chain |

### Mission Appearances
M01 (isolate anomaly), M02 (interpret distorted returns), M03 (scan fragments), M04 (passive/active tracking), M06 (reconstruct audio logs), M07 (track moving objects), M08 (activate chamber with frequency sequence), M09 (identify jamming frequencies), M10 (map expanding void), M11 (translate alien waveform), M12 (maintain frequency lock)

---

## 2. Weapons — Precision Timing

**Station Identity:** The hands of the ship. Execution under pressure. Signal manipulation + precision control.

### Base UI Mechanic
- Expanding/contracting timing bar or rotating dial
- Player taps/holds/releases at exact moment (green zone)
- Can chain multiple timed inputs

**Core Loop:** `Charge → Time → Execute`

### Difficulty Scaling

| Act | Conditions |
|---|---|
| **Act 1** | Large timing window. Slow movement. Single input actions. |
| **Act 2** | Smaller windows. Variable speed — unpredictable rhythm. Multi-step sequences (tap → hold → release). |
| **Act 3** | Very tight windows. External interference — screen shake, fake cues. Requires syncing with team (execute on Captain/Engineer cue). |

### Failure States
| Failure | Consequence |
|---|---|
| Early/late input | Weak or failed action — ping too weak, debris not cleared |
| Missed chain | Resets entire sequence |
| Critical moment failure | Mistimed action amplifies danger — draws attention, destabilizes structure |

### Mission Appearances
M01 (calibration ping), M02 (directional sonar bursts to map blind zones), M03 (micro-probe trajectory), M04 (defensive countermeasures charge), M05 (comms array lock/unlock), M06 (precision cutting tool), M07 (decoy pulse deployment), M08 (resonance bursts to stabilize structure), M09 (real-time frequency jamming battle), M10 (debris clearing), M11 (amplify and broadcast signal), M12 (synchronized group trigger — entire crew)

---

## 3. Engineer — Resource Routing

**Station Identity:** The heart of the ship. Everything runs through Engineer.

### Base UI Mechanic
- System grid with nodes (power, cooling, sonar, propulsion, weapons, hull integrity)
- Player routes limited power via sliders or connection routing
- Trade-offs always visible — you cannot power everything

**Core Loop:** `Allocate → Monitor → Rebalance`

### Difficulty Scaling

| Act | Conditions |
|---|---|
| **Act 1** | 2–3 active systems. Generous resource pool. Slow change rates. |
| **Act 2** | 4–6 active systems. Conflicting demands — can't power everything. System degradation over time. |
| **Act 3** | Critical overload scenarios. Cascading failures — one system affects others. Real-time pressure spikes requiring rapid rerouting. |

### Failure States
| Failure | Consequence |
|---|---|
| System overload | Shutdown — sonar offline, engines stall, hull undefended |
| Underpowering | Reduced team effectiveness across all stations |
| Chain failure | Multiple systems collapse simultaneously — mission critical |

### Mission Appearances
M01 (power balance: propulsion vs sonar), M02 (hull pressure dampening sequence), M03 (radiation scan + system isolation), M04 (hull stress management), M05 (decrypt hidden files — pattern puzzle), M06 (restore power to wreck systems), M07 (resonance dampening — match target waveform), M08 (power ancient systems safely), M09 (frequency filtering shields), M10 (dynamic load balancing under collapse), M11 (build output signal via energy routing), M12 (push reactor beyond safe limits)

---

## 4. Navigator — Path / Position Control

**Station Identity:** The eyes of the ship. The crew goes nowhere without Navigator.

### Base UI Mechanic
- Top-down map or 3D corridor view
- Player draws path or adjusts heading + thrust
- Must avoid obstacles while maintaining objective alignment

**Core Loop:** `Plan → Adjust → Hold Position`

### Difficulty Scaling

| Act | Conditions |
|---|---|
| **Act 1** | Clear paths. Slow movement. Minimal obstacles. |
| **Act 2** | Dynamic obstacles — falling debris, moving objects. Limited visibility (depends on Sonar). Requires fine positioning — hold within zone. |
| **Act 3** | Constant environmental change. No full map — partial information only. Precision alignment required for team success — very tight zones. |

### Failure States
| Failure | Consequence |
|---|---|
| Collision | Hull damage — increases Engineer burden immediately |
| Drift | Misalignment — Sonar and Weapons effectiveness drops |
| Getting lost | Mission timer pressure increases — forces rushed decisions |

### Mission Appearances
M01 (heading alignment to bearing), M02 (waypoint path through unmapped trench), M03 (precision hold over debris field), M04 (maintain exact distance from structure), M05 (exit route vs hidden coordinates — branching map), M06 (position alongside unstable wreck), M07 (counter-thrust stabilization against currents), M08 (path trace through interior corridors), M09 (evasive maneuvers around rival sub), M10 (descent path through collapsing terrain), M11 (hold exact position at signal origin), M12 (lock alignment for maximum signal projection)

---

## 5. Captain — Binary Command Decision

**Station Identity:** The voice of the ship. Every decision falls here — and ripples to everyone.

### Base UI Mechanic
- Clear decision prompts (2–3 options maximum)
- Timer-based choice in high-pressure moments
- Limited override tokens available (use sparingly — they don't refresh often)

**Core Loop:** `Assess → Decide → Commit`

### Difficulty Scaling

| Act | Conditions |
|---|---|
| **Act 1** | Clear "right-feeling" choices. Longer decision time. Low immediate consequence. |
| **Act 2** | Trade-offs become real — gain vs risk. Less time to decide. Outcomes affect multiple stations simultaneously. |
| **Act 3** | No obvious right answer. Very limited time. Decisions reshape entire mission outcome — some irreversible. |

### Failure States
| Failure | Consequence |
|---|---|
| Wrong decision | Amplifies difficulty across all stations immediately |
| Indecision (timeout) | Default worst-case scenario activates automatically |
| Final mission failure | Irreversible consequences — loss of system, forced sacrifice path |

### Mission Appearances
M01 (investigate vs continue trial), M02 (approve uncharted descent), M03 (log vs suppress report), M04 (advance vs abort at depth), M05 (accept vs override recall order), M06 (investigate wreck vs bypass), M07 (shutdown vs stay operational), M08 (authorize structure entry), M09 (ally / compete / isolate strategy), M10 (descend into abyss), M11 (communication vs containment), M12 (sacrifice vs retreat — final decision)

---

## How the Archetypes Interlock

The five systems are designed to **create dependency chains** — failure at one station degrades others.

```
Sonar failure     → Navigator loses visibility  → collision risk rises
Navigator failure → hull damage                 → Engineer overloaded
Engineer failure  → systems offline             → Sonar/Weapons degrade
Weapons failure   → threats not neutralized     → Engineer takes damage load
Captain failure   → all stations get harder     → cascade begins
```

**The chain runs both ways.** A great Sonar performance gives Navigator perfect visibility. A well-managed Engineer gives Weapons full charge capacity. Teamwork is the mechanic — not just the theme.

---

## Interaction Pattern Reference

| Station | Primary Input | Secondary Input | Pressure Indicator |
|---|---|---|---|
| Sonar | Drag/swipe dial | Pattern match layer | Signal instability visual |
| Weapons | Tap / hold / release | Chain sequence | Timing window width |
| Engineer | Slider routing | Node connection | System heat / load bars |
| Navigator | Path draw / thrust adjust | Hold-position zone | Collision proximity alert |
| Captain | Button select | Override token use | Decision countdown timer |

---

## Reusability Principle

Each archetype appears in **every mission** — only the context changes:

| Mission Context | What Changes |
|---|---|
| Narrative stakes | The story reason for the action |
| Visual skin | The UI looks different (ancient structure vs wreck vs open ocean) |
| Difficulty parameters | Window size, noise level, number of systems, timer length |
| Consequence weight | How badly failure hurts in this specific moment |

**The component itself never changes.** This is the development efficiency that makes a 12-mission game buildable.

---

## Franchise Scaling Note

These 5 archetypes are **physics-skin agnostic.** The same components power:

- **HMS Leviathan** — ocean / pressure / sonar context
- **HMS Odyssey** — space / vacuum / sensor context  
- **HMS Chronos** — time / paradox / navigation context

Build them right once. They travel with the franchise.

---

*Document version 1.0 — compiled from design session, April 2026*
*Part of HMS Leviathan / The Odyssey Franchise*

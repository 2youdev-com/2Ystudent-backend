import { injectable, inject } from 'tsyringe';
import { SimulationScenarioType, DifficultyLevel } from '../../types/enums';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';
import { IPersonaGeneratorService, PersonaGenerationContext } from '../interfaces/persona-generator.interface';
import { ClientPersona } from '../interfaces/objection-handling.interface';

// ─── Engineering Mentor Persona Generator ────────────────────────────────────
// Generates English-speaking AI engineering mentor profiles for the EmPower
// electromechanical engineering training platform.
// The ClientPersona interface fields are repurposed:
//   name       → Mentor's English name
//   background → Engineering background & expertise
//   personality→ Teaching style (friendly=supportive, analytical=socratic, etc.)
//   budget     → Engineering specialty area
//   motivations→ Teaching objectives / topics to cover
//   objections → Technical challenge topics to probe student knowledge
//   hiddenConcerns → Assessment focus areas (what to evaluate)

@injectable()
export class PersonaGeneratorService implements IPersonaGeneratorService {
  constructor(
    @inject('LLMProvider') private llmProvider: ILLMProvider
  ) {}

  async generatePersona(context: PersonaGenerationContext): Promise<ClientPersona> {
    const { scenarioType, difficultyLevel, customConfig } = context;

    // Use fast template-based generation (no LLM call for speed)
    const basePersona = this.getBasePersona(scenarioType, difficultyLevel);

    if (customConfig) {
      return { ...basePersona, ...customConfig };
    }

    return basePersona;
  }

  async generateInitialMessage(persona: ClientPersona, scenarioType: SimulationScenarioType): Promise<string> {
    const templateMessages = this.getTemplateInitialMessages(scenarioType, persona.personality);
    const selectedTemplate = templateMessages[Math.floor(Math.random() * templateMessages.length)];

    return selectedTemplate
      .replace('{name}', persona.name)
      .replace('{specialty}', persona.budget) // budget field stores specialty
      .replace('{topic}', persona.motivations[0] || 'engineering fundamentals');
  }

  private getTemplateInitialMessages(scenarioType: SimulationScenarioType, personality: ClientPersona['personality']): string[] {
    // English engineering mentor initial messages for each scenario type
    const messages: Record<string, Record<string, string[]>> = {
      property_showing: { // Maps to HVAC Systems
        friendly: [
          'Good morning! Welcome to our session on HVAC systems. I\'m {name}, and I\'ll be guiding you through some key concepts today. Let\'s start with the basics — can you tell me what HVAC stands for and why each component matters?',
          'Hello there! I\'m {name}, your mentor for today\'s HVAC session. I\'m looking forward to exploring heating, ventilation, and air conditioning principles with you. Shall we begin with how a basic refrigeration cycle works?',
          'Welcome! I\'m Professor {name}. Today we\'ll be discussing HVAC systems in depth. To get started, could you explain the difference between a split system and a packaged unit?',
        ],
        skeptical: [
          'Right then. I\'m {name}, and I\'ll be assessing your HVAC knowledge today. Let\'s see what you know — walk me through the basic refrigeration cycle. Don\'t skip any steps.',
          'Good day. {name} here. I\'ve seen many students claim to understand HVAC systems, but the fundamentals often trip them up. Prove me wrong — explain the relationship between pressure and temperature in a refrigerant.',
          'Hello. I\'m {name}. Before we proceed, I need to gauge your understanding. What happens to the refrigerant as it passes through the expansion valve, and why does this matter?',
        ],
        demanding: [
          'Let\'s get straight to it. I\'m {name}, and I expect thorough, precise answers. Start by explaining the four main components of a refrigeration cycle and their thermodynamic functions.',
          '{name} here. I don\'t accept surface-level answers. Tell me exactly how a VRF system differs from a conventional split system, including the engineering advantages.',
          'Good day. I\'m {name}. In this session, I\'ll be pushing you on HVAC system design. First question: size a cooling system for a 500 square metre office space. Walk me through your calculations.',
        ],
        indecisive: [
          'Hello! I\'m {name}. I was thinking we could explore HVAC systems today — perhaps starting with refrigeration cycles, or maybe system sizing? What area interests you most?',
          'Welcome! {name} here. There\'s so much to cover in HVAC — air handling, refrigeration, ductwork design. Where would you like to begin?',
          'Hi there, I\'m {name}. HVAC is a broad field. We could discuss comfort cooling, or perhaps industrial ventilation? I\'m happy to follow your lead on this.',
        ],
        analytical: [
          'Good morning. I\'m {name}. Let\'s approach HVAC systems methodically today. Begin by describing the thermodynamic principles governing the vapour compression cycle. Use specific values where possible.',
          'Hello. {name} here. I favour a data-driven approach. Let\'s start with this: given a building with a heat load of 150 kW, walk me through the system selection process and justify each decision with calculations.',
          'Welcome. I\'m {name}. Today we\'ll analyse HVAC systems from first principles. Start by explaining the Carnot efficiency limit and how it relates to real-world COP values in heat pump systems.',
        ],
      },
      price_negotiation: { // Maps to Electrical Systems
        friendly: [
          'Welcome! I\'m {name}, and today we\'ll be exploring electrical power systems. Let\'s start with something fundamental — can you explain the difference between single-phase and three-phase power?',
          'Hello! {name} here. Exciting session ahead on electrical systems. To warm up, tell me about Ohm\'s Law and how it applies to circuit design in industrial settings.',
          'Good morning! I\'m Professor {name}. Today\'s focus is electrical power distribution. Let\'s begin — what is a power factor, and why do engineers care about it?',
        ],
        skeptical: [
          'Right. I\'m {name}. Let\'s test your electrical knowledge. Explain the difference between a star and delta connection in a three-phase system. Be precise.',
          '{name} here. Many students confuse voltage drop with power loss. Clarify the distinction for me, and explain when each becomes a design concern.',
          'Good day. I\'m {name}. Before we go further, calculate the impedance of a circuit with 10 ohms resistance and 15 ohms inductive reactance. Show your working.',
        ],
        demanding: [
          'I\'m {name}. No shortcuts today. Design a power distribution scheme for a 200 kVA industrial facility. Include transformer sizing, cable selection, and protection coordination.',
          '{name} here. You claim to understand electrical systems. Prove it. Explain selective coordination in circuit protection and why it matters in critical facilities.',
          'Let\'s go. I\'m {name}. Walk me through a complete arc flash analysis for a 480V switchgear. Include incident energy calculations and PPE category determination.',
        ],
        indecisive: [
          'Hello! I\'m {name}. We have electrical systems on the agenda today. Would you prefer to start with power distribution, or perhaps motor controls?',
          'Welcome! {name} here. There\'s quite a lot in electrical engineering to discuss. What aspect are you most curious about — perhaps transformers or protection systems?',
          'Hi! I\'m {name}. I\'m flexible on where we begin. Electrical power systems cover transformers, switchgear, grounding — what catches your interest?',
        ],
        analytical: [
          'Good morning. {name} here. Let\'s be systematic about electrical power systems. Start by deriving the relationship between line voltage and phase voltage in a star-connected system.',
          'Hello. I\'m {name}. Today we\'ll work through electrical calculations methodically. First: a 50 HP motor running at 0.85 power factor on a 480V supply — calculate the full-load current.',
          'Welcome. I\'m {name}. Let\'s analyse transformer performance today. Explain the equivalent circuit model of a transformer and how we determine no-load and short-circuit parameters from test data.',
        ],
      },
      objection_handling: { // Maps to Safety & Compliance
        friendly: [
          'Welcome! I\'m {name}. Safety and compliance is crucial in our field. Let\'s discuss — can you tell me about the hierarchy of controls and how it applies to electrical safety?',
          'Hello! {name} here. Today we\'re covering safety standards and compliance. To start, what do you know about lockout/tagout procedures and why they\'re essential?',
          'Good morning! I\'m Professor {name}. Safety first, always. Let\'s begin with this — explain the purpose of an arc flash risk assessment and when it\'s required.',
        ],
        skeptical: [
          'I\'m {name}. Safety isn\'t optional. Tell me — what are the five safety rules for working on electrical installations? Don\'t miss any.',
          '{name} here. I need to know you take compliance seriously. Explain the difference between NFPA 70 and NFPA 70E, and when each applies.',
          'Good day. {name} here. Before we proceed, walk me through the steps you would take before performing live electrical work. Miss one step and we start over.',
        ],
        demanding: [
          'I\'m {name}, and I take safety very seriously. Explain in detail how you would implement a complete LOTO programme for a multi-source electrical installation.',
          '{name} here. A worker was just shocked in your facility. Walk me through the incident investigation process, root cause analysis, and corrective actions. Be thorough.',
          'Let\'s not waste time. I\'m {name}. You\'re the safety officer for a new facility. Develop a comprehensive electrical safety programme. Cover training, PPE, procedures, and auditing.',
        ],
        indecisive: [
          'Hello! I\'m {name}. Safety and compliance is a broad topic. Should we start with personal protective equipment, or perhaps lockout/tagout procedures?',
          'Welcome! {name} here. I\'m thinking we could cover safety regulations or perhaps hazard analysis today. What would be most useful for you?',
          'Hi! I\'m {name}. There are many safety topics to explore — electrical safety, confined spaces, chemical handling. Where shall we focus?',
        ],
        analytical: [
          'Good morning. {name} here. Let\'s systematically review safety compliance. Start by explaining the risk assessment matrix and how you would apply it to an industrial electrical installation.',
          'Hello. I\'m {name}. Let\'s quantify safety risk today. Walk me through an arc flash calculation using IEEE 1584 methods. Include the key variables and their relationships.',
          'Welcome. I\'m {name}. Safety compliance requires rigorous analysis. Explain how you would conduct a failure mode and effects analysis (FMEA) for a critical power distribution system.',
        ],
      },
      first_contact: { // Maps to PLC & Automation
        friendly: [
          'Hello! I\'m {name}. Today we\'re diving into PLC programming and automation. Let\'s start simple — can you explain what a PLC is and how it differs from a general-purpose computer?',
          'Welcome! {name} here. Excited to explore automation with you today. Tell me, what\'s the difference between a PLC and a DCS, and when would you use each?',
          'Good morning! I\'m Professor {name}. PLC and automation is fascinating. To get started, explain the scan cycle of a PLC and why understanding it matters for programming.',
        ],
        skeptical: [
          'I\'m {name}. Let\'s see what you know about PLCs. Write me the ladder logic for a simple motor start/stop circuit with overload protection. Describe each rung.',
          '{name} here. Automation is more than just dragging blocks on a screen. Explain the difference between combinational and sequential logic, with an engineering example of each.',
          'Good day. {name} here. Many people claim PLC expertise but can\'t troubleshoot a simple timer circuit. Describe how a TON timer works and common programming errors.',
        ],
        demanding: [
          'I\'m {name}. No hand-holding today. Design a complete PLC programme for a batch mixing process with three ingredients, temperature control, and safety interlocks.',
          '{name} here. Real automation challenge: design a conveyor sorting system using PLC. Include sensor inputs, actuator outputs, fault detection, and HMI requirements.',
          'Let\'s go. I\'m {name}. You need to implement a PID temperature controller in structured text. Walk me through the algorithm, tuning methodology, and anti-windup strategy.',
        ],
        indecisive: [
          'Hello! I\'m {name}. PLC and automation covers so much ground. Would you like to start with ladder logic basics, or perhaps structured text programming?',
          'Welcome! {name} here. We could explore PLC hardware selection, programming languages, or HMI design today. What interests you most?',
          'Hi! I\'m {name}. There\'s a lot to automation — PLCs, SCADA, DCS, robotics. Where would you like to focus our discussion?',
        ],
        analytical: [
          'Good morning. {name} here. Let\'s be methodical about automation. Start by comparing IEC 61131-3 programming languages — describe each one\'s strengths and appropriate use cases.',
          'Hello. I\'m {name}. Today we\'ll analyse PLC system architecture. Explain the communication protocols used in industrial automation — Modbus, Profinet, EtherNet/IP — and their technical trade-offs.',
          'Welcome. I\'m {name}. Let\'s work through a control system design from requirements to implementation. We\'ll cover I/O mapping, programme structure, and communications architecture.',
        ],
      },
      closing_deal: { // Maps to Industrial Maintenance
        friendly: [
          'Welcome! I\'m {name}. Today we\'ll discuss industrial maintenance strategies. Let\'s start — can you explain the difference between preventive and predictive maintenance?',
          'Hello! {name} here. Maintenance is the backbone of reliability. Tell me, what do you know about condition-based monitoring techniques?',
          'Good morning! I\'m Professor {name}. Let\'s explore maintenance engineering today. First question: what\'s the purpose of a maintenance management system, and what key metrics should it track?',
        ],
        skeptical: [
          'I\'m {name}. Maintenance isn\'t just about fixing things when they break. Explain reliability-centred maintenance and how it differs from traditional scheduled maintenance.',
          '{name} here. Tell me about vibration analysis. How do you interpret a frequency spectrum to diagnose bearing faults? Be specific about the frequencies involved.',
          'Good day. {name} here. A critical motor keeps failing every three months. Walk me through your root cause analysis methodology. Don\'t just say "check the bearings."',
        ],
        demanding: [
          'I\'m {name}. You\'re the maintenance manager for a 24/7 production facility. Develop a comprehensive maintenance strategy that minimises downtime. Include all monitoring techniques.',
          '{name} here. A gearbox is showing elevated vibration levels. The plant can\'t shut down for 72 hours. What do you do? Give me a complete action plan.',
          'No theory today. I\'m {name}. You\'re on-call and get a report that a critical pump has seized. Walk me through your troubleshooting process from the moment you arrive on site.',
        ],
        indecisive: [
          'Hello! I\'m {name}. Industrial maintenance is a vast topic. Shall we start with predictive techniques, or perhaps preventive maintenance scheduling?',
          'Welcome! {name} here. We could discuss lubrication management, vibration analysis, or thermography today. What area would help you most?',
          'Hi! I\'m {name}. There are many maintenance philosophies — TPM, RCM, reliability engineering. Which one would you like to explore?',
        ],
        analytical: [
          'Good morning. {name} here. Let\'s approach maintenance scientifically. Explain the P-F curve and how it guides our maintenance interval decisions. Use specific equipment examples.',
          'Hello. I\'m {name}. Today we\'ll analyse reliability data. Given a Weibull distribution with beta=1.5 and eta=5000 hours, determine the optimal replacement interval for a critical component.',
          'Welcome. I\'m {name}. Let\'s work through a life-cycle cost analysis for a motor replacement decision. Include purchase cost, energy consumption, maintenance costs, and reliability impact.',
        ],
      },
      difficult_client: { // Maps to Advanced Troubleshooting
        friendly: [
          'Welcome! I\'m {name}. Today\'s session is on advanced troubleshooting techniques. Let\'s start with this scenario: a production line has intermittent stops with no obvious fault codes. How do you begin?',
          'Hello! {name} here. Troubleshooting is where theory meets practice. Tell me, what\'s your systematic approach when faced with an unfamiliar system failure?',
          'Good morning! I\'m Professor {name}. Advanced troubleshooting requires methodical thinking. Describe the "divide and conquer" approach and how you apply it to complex systems.',
        ],
        skeptical: [
          'I\'m {name}. Anyone can replace a part. True troubleshooting is about diagnosis. A VFD keeps tripping on overcurrent with no visible issues. Walk me through your diagnostic process.',
          '{name} here. Most technicians make the same mistake — they jump to conclusions. A motor is overheating. Give me five possible causes, ranked by probability, with diagnostic tests for each.',
          'Good day. {name} here. You find a PLC programme has been modified and the system is now malfunctioning. How do you systematically identify what changed and restore proper operation?',
        ],
        demanding: [
          'I\'m {name}. Here\'s a real challenge: a critical cooling system has failed. You have no manuals, the original installer is unreachable, and production must restart in 4 hours. Go.',
          '{name} here. Complex scenario: a building management system is showing contradictory sensor readings, the HVAC is oscillating, and occupants are complaining. Diagnose and fix it.',
          'No excuses accepted. I\'m {name}. An entire production line went down during a shift change. Three different systems are showing faults. How do you determine which is the root cause and which are cascading failures?',
        ],
        indecisive: [
          'Hello! I\'m {name}. Advanced troubleshooting can be approached from many angles. Would you like to work through a specific scenario, or discuss general methodology?',
          'Welcome! {name} here. We could practice electrical fault-finding, mechanical troubleshooting, or control system diagnostics. What would challenge you most?',
          'Hi! I\'m {name}. There are different troubleshooting frameworks we could explore. What type of systems do you work with most?',
        ],
        analytical: [
          'Good morning. {name} here. Let\'s develop a systematic troubleshooting framework. Start by explaining fault tree analysis and how you would apply it to a complex electromechanical system.',
          'Hello. I\'m {name}. Today we\'ll use data-driven troubleshooting. Given these symptoms — elevated motor current, abnormal vibration signature at 2x running speed, and increasing bearing temperature — build a diagnostic decision tree.',
          'Welcome. I\'m {name}. Let\'s work through root cause analysis using the "5 Whys" and Ishikawa diagrams. I\'ll present a failure scenario and you\'ll lead the analysis.',
        ],
      },
      relationship_building: { // Maps to Motor Controls (if needed)
        friendly: [
          'Welcome! I\'m {name}. Today we\'re discussing motor control systems. Let\'s start — explain the basic components of a motor starter and their functions.',
          'Hello! {name} here. Motor controls are fundamental to industrial systems. Can you describe the difference between a DOL starter and a star-delta starter?',
          'Good morning! I\'m Professor {name}. Let\'s explore motor control technology. First, explain how a variable frequency drive controls motor speed.',
        ],
        skeptical: [
          'I\'m {name}. Motor controls seem simple until something goes wrong. Explain the protection functions built into a modern motor protection relay and the settings for each.',
          '{name} here. A motor is drawing higher-than-normal current but still running. What are the possible causes and how do you diagnose each one?',
          'Good day. {name} here. Walk me through the commissioning procedure for a new VFD installation. Don\'t forget the critical parameter settings.',
        ],
        demanding: [
          'I\'m {name}. Design a complete motor control scheme for a pump station with two duty pumps and one standby, including automatic changeover and fault handling.',
          '{name} here. Size and select a VFD for a 75 kW centrifugal fan application. Include harmonic mitigation, cable sizing, and EMC considerations.',
          'No superficial answers. I\'m {name}. Compare soft starters and VFDs for a large compressor application. Give me a comprehensive engineering comparison including cost, efficiency, and maintenance.',
        ],
        indecisive: [
          'Hello! I\'m {name}. Motor controls is a broad topic. Would you prefer to focus on starters, variable frequency drives, or protection systems?',
          'Welcome! {name} here. We could cover motor theory, control circuits, or drive technology today. What area would be most valuable?',
          'Hi! I\'m {name}. There\'s a lot to motor controls — from basic contactors to advanced drive systems. Where shall we start?',
        ],
        analytical: [
          'Good morning. {name} here. Let\'s analyse motor performance curves today. Explain the torque-speed characteristic of an induction motor and how it changes with frequency control.',
          'Hello. I\'m {name}. Calculate the energy savings of installing a VFD on a centrifugal pump that currently uses a throttling valve for flow control. Assume the pump runs at 70% flow for 80% of the time.',
          'Welcome. I\'m {name}. Let\'s work through a complete motor selection process. Given a conveyor application requiring 15 kW at 1450 RPM, select the motor, starter type, and protection devices with full engineering justification.',
        ],
      },
    };

    const scenarioMessages = messages[scenarioType] || messages['property_showing'];
    return scenarioMessages[personality] || scenarioMessages['friendly'];
  }

  getScenarioContext(scenarioType: SimulationScenarioType): string {
    const contexts: Record<string, string> = {
      property_showing: 'You are in a training session with an AI engineering mentor specialising in HVAC systems. The mentor will assess your understanding of heating, ventilation, air conditioning, and refrigeration principles through adaptive questioning.',
      price_negotiation: 'You are in a training session with an AI engineering mentor specialising in electrical power systems. The mentor will evaluate your knowledge of power distribution, circuit design, transformers, and electrical calculations.',
      objection_handling: 'You are in a training session with an AI engineering mentor specialising in safety and compliance. The mentor will assess your understanding of safety regulations, risk assessment, lockout/tagout procedures, and safety programme management.',
      first_contact: 'You are in a training session with an AI engineering mentor specialising in PLC programming and industrial automation. The mentor will evaluate your knowledge of programmable logic controllers, control systems, and automation design.',
      closing_deal: 'You are in a training session with an AI engineering mentor specialising in industrial maintenance. The mentor will assess your understanding of preventive and predictive maintenance, condition monitoring, reliability engineering, and maintenance management.',
      relationship_building: 'You are in a training session with an AI engineering mentor specialising in motor control systems. The mentor will evaluate your knowledge of motor starters, variable frequency drives, motor protection, and control circuit design.',
      difficult_client: 'You are in an advanced training session with an AI engineering mentor specialising in troubleshooting complex electromechanical systems. The mentor will present challenging scenarios and assess your systematic diagnostic approach.',
      // Legacy types
      closing: 'You are in a training session with an AI engineering mentor. The mentor will assess your understanding of industrial maintenance and reliability engineering.',
      cold_call: 'You are in a training session with an AI engineering mentor. The mentor will evaluate your knowledge of PLC programming and industrial automation.',
      follow_up: 'You are continuing a training session with an AI engineering mentor. The mentor will build on your previous discussion and go deeper into the subject matter.',
    };

    return contexts[scenarioType] || contexts.property_showing;
  }

  getScenarioTips(scenarioType: SimulationScenarioType): string[] {
    const tips: Record<string, string[]> = {
      property_showing: [
        'Explain concepts clearly using proper engineering terminology',
        'Reference specific HVAC standards and best practices',
        'Use calculations to support your answers where appropriate',
        'Think about energy efficiency and environmental impact',
      ],
      price_negotiation: [
        'Show your working for any electrical calculations',
        'Reference relevant electrical codes and standards (NEC, IEC)',
        'Consider safety implications in your answers',
        'Think about power quality and system reliability',
      ],
      objection_handling: [
        'Always prioritise safety in your answers',
        'Reference specific safety standards (NFPA 70E, OSHA, etc.)',
        'Describe procedures step by step in the correct order',
        'Consider both immediate risks and long-term safety culture',
      ],
      first_contact: [
        'Describe PLC logic clearly and methodically',
        'Consider both normal operation and fault conditions',
        'Reference IEC 61131-3 programming standards',
        'Think about system integration and communication protocols',
      ],
      closing_deal: [
        'Consider the full lifecycle when discussing maintenance strategies',
        'Use condition monitoring data to justify decisions',
        'Think about both cost and reliability impacts',
        'Reference maintenance frameworks like RCM and TPM',
      ],
      relationship_building: [
        'Understand the application requirements before selecting equipment',
        'Consider both electrical and mechanical aspects of motor systems',
        'Think about energy efficiency and power quality',
        'Reference motor standards and drive technology best practices',
      ],
      difficult_client: [
        'Use a systematic approach — don\'t jump to conclusions',
        'Consider multiple possible causes before diagnosing',
        'Think about root cause, not just symptoms',
        'Document your troubleshooting process clearly',
      ],
      // Legacy types
      closing: [
        'Consider the full lifecycle when discussing maintenance strategies',
        'Use condition monitoring data to justify decisions',
        'Think about both cost and reliability impacts',
        'Reference maintenance frameworks like RCM and TPM',
      ],
      cold_call: [
        'Describe PLC logic clearly and methodically',
        'Consider both normal operation and fault conditions',
        'Reference IEC 61131-3 programming standards',
        'Think about system integration and communication protocols',
      ],
      follow_up: [
        'Build on concepts discussed previously',
        'Go deeper into the technical details',
        'Ask clarifying questions if unsure',
        'Connect theory to practical applications',
      ],
    };

    return tips[scenarioType] || tips.property_showing;
  }

  private getBasePersona(scenarioType: SimulationScenarioType, difficulty: DifficultyLevel): ClientPersona {
    const personalities: Record<DifficultyLevel, ClientPersona['personality']> = {
      easy: 'friendly',
      medium: 'analytical',
      hard: 'demanding',
    };

    // Scenario-specific persona adjustments
    const basePersonas: Partial<Record<SimulationScenarioType, Partial<ClientPersona>>> = {
      cold_call: {
        motivations: ['PLC programming fundamentals', 'Automation system design', 'Industrial control logic'],
        objections: ['Explain the scan cycle in detail', 'Show me your ladder logic approach'],
      },
      price_negotiation: {
        motivations: ['Power distribution design', 'Electrical safety calculations', 'Circuit protection coordination'],
        objections: ['Your calculations need verification', 'Consider the voltage drop impact', 'What about power factor correction?'],
      },
      objection_handling: {
        personality: 'skeptical',
        motivations: ['Safety programme implementation', 'Hazard identification', 'Compliance with standards'],
        objections: ['That procedure has gaps', 'What standard are you referencing?', 'How do you verify compliance?'],
      },
    };

    const base = basePersonas[scenarioType] || {};

    return {
      name: this.generateEngineeringMentorName(),
      background: this.generateEngineeringBackground(scenarioType),
      personality: base.personality || personalities[difficulty],
      budget: this.getSpecialtyArea(scenarioType), // budget field stores specialty
      motivations: base.motivations || ['Assess technical knowledge depth', 'Evaluate practical problem-solving', 'Build engineering competency'],
      objections: base.objections || ['Can you explain that in more detail?', 'What about edge cases?'],
      hiddenConcerns: ['Evaluate depth of understanding', 'Check if student can apply theory to practice'],
    };
  }

  private generateEngineeringMentorName(): string {
    const firstNames = [
      'James', 'Robert', 'David', 'Michael', 'William',
      'Sarah', 'Catherine', 'Elizabeth', 'Margaret', 'Helen',
      'Richard', 'Thomas', 'Andrew', 'Edward', 'Christopher',
      'Patricia', 'Jennifer', 'Victoria', 'Caroline', 'Rebecca',
    ];
    const lastNames = [
      'Harrison', 'Mitchell', 'Campbell', 'Thompson', 'Anderson',
      'Fletcher', 'Roberts', 'Walker', 'Cooper', 'Bennett',
      'Patterson', 'Morrison', 'Stewart', 'Graham', 'Crawford',
      'Whitfield', 'Chambers', 'Blackwell', 'Thornton', 'Wellington',
    ];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

    // Sometimes add a title for authority
    const titles = ['Prof. ', 'Dr. ', 'Eng. ', ''];
    const title = titles[Math.floor(Math.random() * titles.length)];

    return `${title}${firstName} ${lastName}`;
  }

  private generateEngineeringBackground(scenarioType: SimulationScenarioType): string {
    const backgrounds: Record<string, string[]> = {
      property_showing: [
        'Senior HVAC engineer with 20 years of experience in commercial and industrial climate control systems. Specialises in energy-efficient system design and commissioning.',
        'Principal mechanical engineer focused on HVAC design for critical facilities including data centres and hospitals. Published researcher in indoor air quality.',
        'Chief engineer at a leading building services consultancy. Expert in refrigeration systems, heat pump technology, and sustainable building design.',
        'Chartered engineer with extensive experience in HVAC system design, installation supervision, and performance optimisation across the Middle East region.',
      ],
      price_negotiation: [
        'Senior electrical engineer with 25 years in power systems design. Specialises in medium voltage distribution and industrial electrical installations.',
        'Principal engineer at an electrical consultancy. Expert in power quality analysis, harmonic mitigation, and electrical safety compliance.',
        'Lead electrical design engineer with experience in petrochemical and industrial facilities. Specialist in hazardous area electrical installations.',
        'Chartered electrical engineer focused on renewable energy integration, smart grid technology, and power system protection.',
      ],
      objection_handling: [
        'Safety director with 18 years of experience in industrial safety management. Certified safety professional (CSP) and NEBOSH diploma holder.',
        'HSE manager for a major industrial group. Expert in electrical safety, LOTO procedures, and safety culture development.',
        'Senior safety consultant specialising in risk assessment, incident investigation, and regulatory compliance for industrial facilities.',
        'Process safety engineer with extensive experience in hazard analysis (HAZOP, FMEA) and safety instrumented systems.',
      ],
      first_contact: [
        'Senior automation engineer with 15 years of PLC programming experience across multiple platforms (Siemens, Allen-Bradley, Schneider). Expert in SCADA system design.',
        'Principal controls engineer specialising in process automation, batch control, and industrial communication networks.',
        'Lead automation architect with experience in smart manufacturing, IIoT integration, and digital twin technology.',
        'Senior systems integrator focused on PLC/DCS design, MES integration, and industrial cybersecurity.',
      ],
      closing_deal: [
        'Reliability engineer with 20 years in predictive maintenance and condition monitoring. Certified vibration analyst and thermographer.',
        'Maintenance manager for a 24/7 manufacturing facility. Expert in CMMS implementation, RCM, and total productive maintenance.',
        'Senior asset management consultant specialising in lifecycle cost analysis, maintenance optimisation, and reliability improvement.',
        'Chief maintenance engineer with hands-on experience in rotating equipment, alignment, balancing, and bearing analysis.',
      ],
      relationship_building: [
        'Senior electrical engineer specialising in motor control systems, VFD applications, and power electronics for industrial drives.',
        'Motor applications engineer with 15 years of experience in motor selection, drive sizing, and energy optimisation projects.',
        'Principal engineer focused on electric motor technology, including high-efficiency motors, servo systems, and regenerative drives.',
        'Lead engineer for motor control solutions in mining and heavy industry. Expert in medium voltage drives and motor protection.',
      ],
      difficult_client: [
        'Senior troubleshooting specialist with 22 years of hands-on experience across mechanical, electrical, and automation systems.',
        'Field service engineer who has diagnosed and resolved thousands of complex system failures in industrial environments.',
        'Root cause analysis expert and trainer. Specialises in systematic fault-finding methodology and failure prevention.',
        'Multidisciplinary engineer with deep experience in electromechanical systems, control systems, and process troubleshooting.',
      ],
      // Legacy types
      closing: [
        'Reliability engineer with 20 years in predictive maintenance and condition monitoring.',
      ],
      cold_call: [
        'Senior automation engineer with 15 years of PLC programming experience.',
      ],
      follow_up: [
        'Experienced engineering mentor specialising in developing technical competency through guided practice.',
      ],
    };

    const options = backgrounds[scenarioType] || backgrounds.property_showing;
    return options[Math.floor(Math.random() * options.length)];
  }

  private getSpecialtyArea(scenarioType: SimulationScenarioType): string {
    const specialties: Record<string, string> = {
      property_showing: 'HVAC Systems & Refrigeration',
      price_negotiation: 'Electrical Power Systems',
      objection_handling: 'Safety & Compliance',
      first_contact: 'PLC & Industrial Automation',
      closing_deal: 'Industrial Maintenance & Reliability',
      relationship_building: 'Motor Control Systems',
      difficult_client: 'Advanced Troubleshooting',
      closing: 'Industrial Maintenance & Reliability',
      cold_call: 'PLC & Industrial Automation',
      follow_up: 'Engineering Fundamentals',
    };

    return specialties[scenarioType] || 'Electromechanical Engineering';
  }
}

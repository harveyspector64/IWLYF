document.addEventListener('DOMContentLoaded', () => {
    // Matter.js Modules
    const { Engine, Render, Runner, World, Bodies, Composite, Events, Vector } = Matter;

    // --- Tone.js Setup ---
    // Main synth for pleasant notes (particles and letters)
    const mainSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle8' }, // Changed to triangle8 for a slightly softer, more unique tone
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.5 },
        volume: -8
    }).toDestination();

    // Synth for chords - keeping this distinct
    const chordSynth = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 1.5, // A bit of metallic timbre
        detune: 0,
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.05, decay: 0.3, sustain: 0.8, release: 1.0 },
        volume: -9 // Adjusted volume
    }).toDestination();

    const reverb = new Tone.Reverb(0.6).toDestination();
    mainSynth.connect(reverb);
    chordSynth.connect(reverb);
    // melodicImpactSynth (the "clap") is now removed.

    // Musical Scales and Notes
    const particleNotes = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5'];
    let particleNoteIndex = 0;

    const letterChars = ['I', 'W', 'L', 'Y', 'F'];
    const letterNotes = { 'I': 'C4', 'W': 'E4', 'L': 'G4', 'Y': 'A4', 'F': 'C5' }; // These will now use mainSynth

    const chordProgression = [
        ['C4', 'E4', 'G4'], ['G4', 'B4', 'D5'],
        ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4']
    ];
    let chordIndex = 0;
    let recentlyHitLetters = new Set();
    let lastChordTime = 0;
    const chordCooldown = 3500;
    const letterHitResetTime = 7000;

    // Simulation Setup
    const instructionsDiv = document.getElementById('instructions');
    const container = document.getElementById('simulation-container');
    let renderWidth = container.clientWidth;
    let renderHeight = container.clientHeight;

    const engine = Engine.create();
    const world = engine.world;
    // --- ADJUSTED GRAVITY & PARTICLE LIVELINESS ---
    world.gravity.y = 0.35; // Slightly reduced gravity for more floaty feel

    const render = Render.create({
        element: container,
        engine: engine,
        options: {
            width: renderWidth, height: renderHeight,
            wireframes: false, background: 'black',
            pixelRatio: window.devicePixelRatio || 1
        }
    });

    // Boundary Walls (same as V2)
    const wallThickness = 60;
    const wallOptions = { isStatic: true, label: 'wall', render: { fillStyle: '#101010' } };
    World.add(world, [
        Bodies.rectangle(renderWidth / 2, -wallThickness / 2 + 1, renderWidth + 2, wallThickness, { ...wallOptions }),
        Bodies.rectangle(renderWidth / 2, renderHeight + wallThickness / 2 - 1, renderWidth + 2, wallThickness, { ...wallOptions }),
        Bodies.rectangle(-wallThickness / 2 + 1, renderHeight / 2, wallThickness, renderHeight + 2, { ...wallOptions }),
        Bodies.rectangle(renderWidth + wallThickness / 2 - 1, renderHeight / 2, wallThickness, renderHeight + 2, { ...wallOptions })
    ]);

    // Letter Sizing and Positioning (using logic from V2, which was good)
    const letterBodies = [];
    const letterConfig = { /* ... same as V2 ... */
        count: letterChars.length,
        yPosRatio: 0.28,
        baseWidthToScreenRatio: 0.1,
        maxWidth: 60, minWidth: 25,
        aspectRatio: 1.5,
        minSpacingToWidthRatio: 0.4
    };
    // Calculations for effectiveLetterWidth, finalLetterHeight, spacingUnit, letterYPosition (same as V2)
    let effectiveLetterWidth = Math.min(letterConfig.maxWidth, renderWidth * letterConfig.baseWidthToScreenRatio);
    effectiveLetterWidth = Math.max(letterConfig.minWidth, effectiveLetterWidth);
    const finalLetterHeight = effectiveLetterWidth * letterConfig.aspectRatio;
    const totalLetterBlockWidth = letterConfig.count * effectiveLetterWidth;
    const minTotalSpacingWidth = (letterConfig.count + 1) * (effectiveLetterWidth * letterConfig.minSpacingToWidthRatio);
    let availableWidthForLettersAndSpacing = renderWidth * 0.95;
    if (totalLetterBlockWidth + minTotalSpacingWidth > availableWidthForLettersAndSpacing) {
        let excess = (totalLetterBlockWidth + minTotalSpacingWidth) - availableWidthForLettersAndSpacing;
        let reductionPerLetterBlock = excess / letterConfig.count;
        effectiveLetterWidth -= (reductionPerLetterBlock*0.8);
        effectiveLetterWidth = Math.max(letterConfig.minWidth, effectiveLetterWidth);
    }
    const finalTotalLetterWidth = letterConfig.count * effectiveLetterWidth;
    const spacingUnit = (availableWidthForLettersAndSpacing - finalTotalLetterWidth) / (letterConfig.count + 1);
    const letterYPosition = renderHeight * letterConfig.yPosRatio;

    letterChars.forEach((char, index) => {
        const xPos = (spacingUnit * (index + 1)) + (effectiveLetterWidth * index) + (effectiveLetterWidth / 2) + (renderWidth * 0.025);
        const letterBody = Bodies.rectangle(
            xPos, letterYPosition, effectiveLetterWidth, finalLetterHeight, {
                isStatic: true, label: `letter-${char}`, customChar: char,
                friction: 0.3, restitution: 0.5, // Letter physics properties
                render: { fillStyle: `hsl(${index * (360 / letterConfig.count)}, 70%, 75%)` }
            }
        );
        letterBodies.push(letterBody);
    });
    World.add(world, letterBodies);


    // Particle Creation
    const particles = []; // Particles will now accumulate
    let audioStarted = false;
    let soundStatusElement = document.getElementById('soundStatus');

    function createParticle(x, y) {
        if (!audioStarted) {
            console.log("V3: Attempting to start audio context due to user gesture...");

document.addEventListener('DOMContentLoaded', () => {
    // Matter.js Modules
    const { Engine, Render, Runner, World, Bodies, Composite, Events, Vector } = Matter;

    // --- Tone.js Setup ---
    const mainSynth = new Tone.PolySynth(Tone.Synth, {
        // --- V6: Simplest oscillator for click reduction ---
        oscillator: { type: 'sine' },
        // --- V6: Even softer envelope ---
        envelope: {
            attack: 0.025, // Increased attack
            decay: 0.25,
            sustain: 0.2,
            release: 0.7, // Increased release
        },
        volume: -9 // Adjusted volume
    }).toDestination();

    const chordSynth = new Tone.PolySynth(Tone.Synth, { // V6: Simplified chord synth
        oscillator: { type: 'triangle' }, // Using triangle for a softer chord
        envelope: {
            attack: 0.05, // Smoother attack
            decay: 0.3,
            sustain: 0.7,
            release: 1.0, // Smoother release
        },
        volume: -12 // Adjusted volume
    }).toDestination();

    const reverb = new Tone.Reverb({
        decay: 1.2,
        wet: 0.0 // --- V6: Bypass reverb for click testing ---
    }).toDestination();

    mainSynth.connect(reverb); // Still connect, but wet=0 means dry signal
    chordSynth.connect(reverb);

    const particleNotes = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5'];
    let particleNoteIndex = 0;
    const letterChars = ['I', 'W', 'L', 'Y', 'F'];
    const letterNotes = { 'I': 'C4', 'W': 'E4', 'L': 'G4', 'Y': 'A4', 'F': 'C5' };
    const chordProgression = [ /* ... same ... */ ];
    let chordIndex = 0;
    let recentlyHitLetters = new Set();
    let lastChordTime = 0;
    const chordCooldown = 3500;
    const letterHitResetTime = 7000;

    const instructionsDiv = document.getElementById('instructions');
    const container = document.getElementById('simulation-container');
    let renderWidth = container.clientWidth;
    let renderHeight = container.clientHeight;

    const engine = Engine.create();
    const world = engine.world;
    world.gravity.y = 0.3; // Kept from V5

    const render = Render.create({ /* ... same ... */ });
    const wallThickness = 60;
    const wallOptions = { isStatic: true, label: 'wall', render: { fillStyle: '#101010' } };
    World.add(world, [ /* ... walls same ... */ ]);

    const letterBodies = [];
    const letterConfig = { /* ... same as V5 ... */ };
    // ... Letter sizing and positioning logic same as V5 ...
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

    letterChars.forEach((char, index) => { /* ... same letter creation, using V5 physics ... */
        const xPos = (spacingUnit * (index + 1)) + (effectiveLetterWidth * index) + (effectiveLetterWidth / 2) + (renderWidth * 0.025);
        const letterBody = Bodies.rectangle(
            xPos, letterYPosition, effectiveLetterWidth, finalLetterHeight, {
                isStatic: true, label: `letter-${char}`, customChar: char,
                friction: 0.2, restitution: 0.6,
                render: { fillStyle: `hsl(${index * (360 / letterConfig.count)}, 70%, 75%)` }
            }
        );
        letterBodies.push(letterBody);
    });
    World.add(world, letterBodies);


    const particles = [];
    let audioStarted = false;
    let soundStatusElement = document.getElementById('soundStatus');

    function createParticle(x, y) {
        if (!audioStarted) {
            console.log("V6: Attempting to start audio context...");
            const audioContext = Tone.getContext().rawContext;
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().then(() => console.log("V6: AudioContext explicitly resumed."))
                                   .catch(e => console.error("V6: Error resuming existing AudioContext:", e));
            }
            Tone.start().then(() => {
                audioStarted = true;
                console.log("V6: Tone.js audio context is RUNNING!");
                if (instructionsDiv) instructionsDiv.style.display = 'none';
                if (soundStatusElement) soundStatusElement.textContent = "Sound ready!";
                console.log("V6: Tone.Destination volume:", Tone.Destination.volume.value);
                console.log("V6: Tone.Destination muted:", Tone.Destination.mute);

                // --- V6: Transport-based warm-up ---
                // Ensure transport is started
                if (Tone.Transport.state !== "started") {
                    Tone.Transport.start();
                    console.log("V6: Tone.Transport started.");
                }
                // Schedule a brief, silent (or nearly silent) event to ensure pipeline is active
                Tone.Transport.scheduleOnce((time) => {
                    // You could trigger a very quiet, short sound here if desired for testing,
                    // but often just scheduling an event is enough.
                    // e.g., mainSynth.triggerAttackRelease('C2', '128n', time, -80);
                    console.log("V6: Transport warm-up event executed at", time);
                }, Tone.now() + 0.05); // Schedule 50ms in the future

                // --- V6: REMOVED EXPLICIT PRIMING NOTE ---

            }).catch(e => {
                console.error("V6: Tone.js audio context FAILED to start:", e);
                if (soundStatusElement) soundStatusElement.textContent = "Sound error. Tap again.";
            });
        }

        const particleRadius = Math.max(4, Math.min(renderWidth, renderHeight) * 0.014);
        const particle = Bodies.circle(x, y, particleRadius, {
            // Using V5 particle physics, as they were likely good
            restitution: 0.82, friction: 0.015, frictionAir: 0.002,
            density: 0.0006, label: 'particle',
            render: { fillStyle: `hsl(${Math.random() * 360}, 90%, 70%)` }
        });
        particles.push(particle);
        World.add(world, particle);
    }

    function handleInteraction(eventX, eventY) { /* ... same ... */ }
    container.addEventListener('click', (event) => handleInteraction(event.clientX, event.clientY));
    container.addEventListener('touchstart', (event) => { /* ... same ... */ }, { passive: false });

    Events.on(engine, 'collisionStart', (event) => {
        if (!audioStarted || Tone.context.state !== 'running') { return; }

        const pairs = event.pairs;
        let newLetterHitThisFrame = false;

        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            // ... (bodyA, bodyB definition) ...
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;


            let noteToPlay = null;
            let soundSynthInstance = mainSynth;
            let volume = -12;
            let hitChar = null;
            let particleBody = null;

            if (bodyA.label.startsWith('letter-') && bodyB.label === 'particle') {
                hitChar = bodyA.customChar; particleBody = bodyB;
            } else if (bodyB.label.startsWith('letter-') && bodyA.label === 'particle') {
                hitChar = bodyB.customChar; particleBody = bodyA;
            }

            if (hitChar) {
                noteToPlay = letterNotes[hitChar];
                const impactVelocity = particleBody ? Vector.magnitude(particleBody.velocity) : 1;
                volume = Math.min(-8, -17 + Math.log10(impactVelocity + 1) * 7); // Adjusted letter hit volume
                if (!recentlyHitLetters.has(hitChar)) { /* ... same ... */ }
                const letterBody = bodyA.label.startsWith('letter-') ? bodyA : bodyB; /* ... same ... */
                // ... (letter flash)
                const originalColor = letterBody.render.fillStyle;
                letterBody.render.fillStyle = '#FFFFFF';
                setTimeout(() => { letterBody.render.fillStyle = originalColor; }, 90);


            } else if (bodyA.label === 'particle' && bodyB.label === 'particle') {
                noteToPlay = particleNotes[particleNoteIndex % particleNotes.length];
                particleNoteIndex++;
                const impactVelocity = Vector.magnitude(Vector.sub(bodyA.velocity, bodyB.velocity));
                volume = Math.min(-12, -22 + Math.log10(impactVelocity + 1) * 5); // Adjusted p-p volume
            }

            if (noteToPlay && Tone.context.state === 'running') {
                // Kept '8t' duration from V5, will see if sine wave + envelope is enough
                soundSynthInstance.triggerAttackRelease(noteToPlay, '8t', Tone.now(), volume);
            }
        }

        if (newLetterHitThisFrame && recentlyHitLetters.size === letterChars.length) {
             // ... (chord logic same as V5) ...
            const now = Tone.now() * 1000;
            if (now - lastChordTime > chordCooldown) {
                const currentChord = chordProgression[chordIndex % chordProgression.length];
                if (Tone.context.state === 'running') {
                    chordSynth.triggerAttackRelease(currentChord, '0.7n', Tone.now());
                }
                chordIndex++; recentlyHitLetters.clear(); lastChordTime = now;
                container.style.boxShadow = '0 0 35px rgba(150, 230, 255, 0.9)';
                setTimeout(() => { container.style.boxShadow = '0 0 15px rgba(128, 128, 255, 0.3)'; }, 700);
            }
        }
    });

    Events.on(render, 'afterRender', () => { /* ... same text rendering ... */ });
    window.addEventListener('resize', () => { /* ... same basic resize ... */ });

    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);

    if (instructionsDiv && soundStatusElement) { /* ... same initial message ... */ }
    console.log("IWLYF Music-Physics Simulator V6 Initialized!");
});

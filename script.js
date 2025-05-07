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
            // Try to ensure Tone.js's internal context is the one we are starting.
            const audioContext = Tone.getContext().rawContext;
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    console.log("V3: AudioContext explicitly resumed.");
                }).catch(e => console.error("V3: Error resuming existing AudioContext:", e));
            }

            Tone.start().then(() => {
                audioStarted = true;
                console.log("V3: Tone.js audio context is RUNNING!");
                if (instructionsDiv) instructionsDiv.style.display = 'none';
                if (soundStatusElement) soundStatusElement.textContent = "Sound ready!";

                // --- IOS AUDIO "PRIMING" ATTEMPT ---
                // Play a very short, nearly inaudible note to help "prime" the audio path on iOS
                // This is a common trick, but not guaranteed.
                mainSynth.triggerAttackRelease('C8', '128n', Tone.now(), -70); // -70dB is very quiet
                console.log("V3: Audio priming note triggered.");

            }).catch(e => {
                console.error("V3: Tone.js audio context FAILED to start:", e);
                if (soundStatusElement) soundStatusElement.textContent = "Sound error. Tap again or check browser.";
            });
        }

        const particleRadius = Math.max(4, Math.min(renderWidth, renderHeight) * 0.014); // Slightly larger
        const particle = Bodies.circle(x, y, particleRadius, {
            // --- ADJUSTED PARTICLE PHYSICS FOR LIVELINESS ---
            restitution: 0.75,         // More bouncy
            friction: 0.02,            // Very low friction
            frictionAir: 0.005,        // Slight air friction for eventual settling if many accumulate
            density: 0.001,          // Lighter particles
            label: 'particle',
            render: { fillStyle: `hsl(${Math.random() * 360}, 90%, 70%)` } // Brighter colors
        });
        particles.push(particle);
        World.add(world, particle);

        // --- REMOVED PARTICLE TIMEOUT ---
        // Particles no longer disappear automatically
    }

    // Event Listeners for Particle Creation (same as V2)
    function handleInteraction(eventX, eventY) {
        const rect = container.getBoundingClientRect();
        createParticle(eventX - rect.left, eventY - rect.top);
    }
    container.addEventListener('click', (event) => {
        handleInteraction(event.clientX, event.clientY);
    });
    container.addEventListener('touchstart', (event) => {
        if (event.target === container || container.contains(event.target)) {
             event.preventDefault();
        }
        for (let i = 0; i < event.changedTouches.length; i++) {
            handleInteraction(event.changedTouches[i].clientX, event.changedTouches[i].clientY);
        }
    }, { passive: false });


    // Collision Handling
    Events.on(engine, 'collisionStart', (event) => {
        if (!audioStarted || Tone.context.state !== 'running') { return; }

        const pairs = event.pairs;
        let newLetterHitThisFrame = false;

        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;

            let noteToPlay = null;
            let soundSynthInstance = mainSynth; // --- ALWAYS USE mainSynth FOR SINGLE NOTES ---
            let volume = -12;
            let hitChar = null;
            let particleBody = null;

            if (bodyA.label.startsWith('letter-') && bodyB.label === 'particle') {
                hitChar = bodyA.customChar; particleBody = bodyB;
            } else if (bodyB.label.startsWith('letter-') && bodyA.label === 'particle') {
                hitChar = bodyB.customChar; particleBody = bodyA;
            }

            if (hitChar) { // Particle hits a letter
                noteToPlay = letterNotes[hitChar];
                // volume can be slightly louder or more distinct for letter hits if desired
                const impactVelocity = particleBody ? Vector.magnitude(particleBody.velocity) : 1;
                volume = Math.min(-6, -15 + Math.log10(impactVelocity + 1) * 7); // Adjusted volume for letters

                if (!recentlyHitLetters.has(hitChar)) {
                    recentlyHitLetters.add(hitChar);
                    newLetterHitThisFrame = true;
                    setTimeout(() => recentlyHitLetters.delete(hitChar), letterHitResetTime);
                }
                const letterBody = bodyA.label.startsWith('letter-') ? bodyA : bodyB;
                const originalColor = letterBody.render.fillStyle;
                letterBody.render.fillStyle = '#FFFFFF'; // Flash white
                setTimeout(() => { letterBody.render.fillStyle = originalColor; }, 100);

            } else if (bodyA.label === 'particle' && bodyB.label === 'particle') { // Particle hits particle
                noteToPlay = particleNotes[particleNoteIndex % particleNotes.length];
                particleNoteIndex++;
                const impactVelocity = Vector.magnitude(Vector.sub(bodyA.velocity, bodyB.velocity));
                volume = Math.min(-10, -20 + Math.log10(impactVelocity + 1) * 5);
            }

            if (noteToPlay && Tone.context.state === 'running') {
                soundSynthInstance.triggerAttackRelease(noteToPlay, '16n', Tone.now(), volume);
            }
        }

        if (newLetterHitThisFrame && recentlyHitLetters.size === letterChars.length) {
            const now = Tone.now() * 1000;
            if (now - lastChordTime > chordCooldown) {
                const currentChord = chordProgression[chordIndex % chordProgression.length];
                if (Tone.context.state === 'running') {
                    chordSynth.triggerAttackRelease(currentChord, '0.7n', Tone.now()); // Chord duration slightly shorter
                }
                chordIndex++;
                recentlyHitLetters.clear();
                lastChordTime = now;
                container.style.boxShadow = '0 0 35px rgba(150, 230, 255, 0.9)';
                setTimeout(() => { container.style.boxShadow = '0 0 15px rgba(128, 128, 255, 0.3)'; }, 700);
            }
        }
    });

    // Drawing Text on Letters (using finalLetterHeight & effectiveLetterWidth from V2 logic)
    Events.on(render, 'afterRender', () => {
        const context = render.context;
        context.fillStyle = 'rgba(0, 0, 0, 0.65)'; // Slightly more opaque
        const fontSize = Math.min(finalLetterHeight * 0.5, effectiveLetterWidth * 0.6); // Adjusted font size
        context.font = `bold ${fontSize}px Arial, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        letterBodies.forEach(body => {
            context.fillText(body.customChar, body.position.x, body.position.y);
        });
    });

    // Window resize (same as V2 - basic canvas update)
    window.addEventListener('resize', () => {
        renderWidth = container.clientWidth;
        renderHeight = container.clientHeight;
        render.canvas.width = renderWidth;
        render.canvas.height = renderHeight;
        Render.setPixelRatio(render, window.devicePixelRatio || 1);
        // A full dynamic resize of letters would go here if implemented.
        console.log("Window resized. For optimal letter layout, refresh or implement full dynamic resize.");
    });

    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);

    if (instructionsDiv && soundStatusElement) {
         soundStatusElement.textContent = "Tap to begin creating music!";
    } else if (instructionsDiv) {
        let p = document.createElement('p');
        p.id = 'soundStatus';
        p.textContent = "Tap to begin creating music!";
        instructionsDiv.appendChild(p);
        soundStatusElement = p;
    }
    console.log("IWLYF Music-Physics Simulator V3 Initialized!");
});

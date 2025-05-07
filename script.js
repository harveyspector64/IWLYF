document.addEventListener('DOMContentLoaded', () => {
    // Matter.js Modules
    const { Engine, Render, Runner, World, Bodies, Composite, Events, Vector } = Matter;

    // --- Tone.js Setup ---
    const mainSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle8' },
        // --- V5: ADJUSTED ENVELOPE FOR CLICK REDUCTION ---
        envelope: {
            attack: 0.015, // Slightly longer attack
            decay: 0.2,
            sustain: 0.3,
            release: 0.6, // Slightly longer release
        },
        volume: -7 // Kept volume from V4 test
    }).toDestination();

    const chordSynth = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 1.6, // Slightly adjusted
        detune: 0,
        oscillator: { type: "fatsawtooth", count: 3, spread: 20 }, // Richer sawtooth
        envelope: { attack: 0.05, decay: 0.3, sustain: 0.8, release: 1.0 },
        volume: -10 // Adjusted volume
    }).toDestination();

    const reverb = new Tone.Reverb({
        decay: 1.5, // Shorter reverb tail
        wet: 0.25   // A bit less reverb
    }).toDestination();

    mainSynth.connect(reverb);
    chordSynth.connect(reverb);

    const particleNotes = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5'];
    let particleNoteIndex = 0;
    const letterChars = ['I', 'W', 'L', 'Y', 'F'];
    const letterNotes = { 'I': 'C4', 'W': 'E4', 'L': 'G4', 'Y': 'A4', 'F': 'C5' };
    const chordProgression = [
        ['C4', 'E4', 'G4'], ['G4', 'B4', 'D5'],
        ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4']
    ];
    let chordIndex = 0;
    let recentlyHitLetters = new Set();
    let lastChordTime = 0;
    const chordCooldown = 3500;
    const letterHitResetTime = 7000;

    const instructionsDiv = document.getElementById('instructions');
    const container = document.getElementById('simulation-container');
    let renderWidth = container.clientWidth;
    let renderHeight = container.clientHeight;

    const engine = Engine.create({
        // V5: Engine iterations for potentially better collision response
        // positionIterations: 8, // Default 6
        // velocityIterations: 6  // Default 4
        // Enable these if simple physics changes aren't enough, slight performance cost
    });
    const world = engine.world;
    world.gravity.y = 0.3; // --- V5: SLIGHTLY REDUCED GRAVITY ---

    const render = Render.create({
        element: container, engine: engine,
        options: {
            width: renderWidth, height: renderHeight,
            wireframes: false, background: 'black',
            pixelRatio: window.devicePixelRatio || 1
        }
    });

    const wallThickness = 60;
    const wallOptions = { isStatic: true, label: 'wall', render: { fillStyle: '#101010' } };
    World.add(world, [ /* ... walls same ... */
        Bodies.rectangle(renderWidth / 2, -wallThickness / 2 + 1, renderWidth + 2, wallThickness, { ...wallOptions }),
        Bodies.rectangle(renderWidth / 2, renderHeight + wallThickness / 2 - 1, renderWidth + 2, wallThickness, { ...wallOptions }),
        Bodies.rectangle(-wallThickness / 2 + 1, renderHeight / 2, wallThickness, renderHeight + 2, { ...wallOptions }),
        Bodies.rectangle(renderWidth + wallThickness / 2 - 1, renderHeight / 2, wallThickness, renderHeight + 2, { ...wallOptions })
    ]);

    const letterBodies = [];
    const letterConfig = { /* ... same as V3/V4 ... */
        count: letterChars.length, yPosRatio: 0.28, baseWidthToScreenRatio: 0.1,
        maxWidth: 60, minWidth: 25, aspectRatio: 1.5, minSpacingToWidthRatio: 0.4
    };
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
                friction: 0.2, // --- V5: Reduced letter friction ---
                restitution: 0.6, // --- V5: Increased letter bounciness ---
                render: { fillStyle: `hsl(${index * (360 / letterConfig.count)}, 70%, 75%)` }
            }
        );
        letterBodies.push(letterBody);
    });
    World.add(world, letterBodies);

    const particles = [];
    let audioStarted = false;
    let soundStatusElement = document.getElementById('soundStatus');
    // let initialSoundTestDone = false; // V4 diagnostic, can be removed

    function createParticle(x, y) {
        if (!audioStarted) {
            console.log("V5: Attempting to start audio context...");
            const audioContext = Tone.getContext().rawContext;
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().then(() => console.log("V5: AudioContext explicitly resumed."))
                                   .catch(e => console.error("V5: Error resuming existing AudioContext:", e));
            }
            Tone.start().then(() => {
                audioStarted = true;
                console.log("V5: Tone.js audio context is RUNNING!");
                if (instructionsDiv) instructionsDiv.style.display = 'none';
                if (soundStatusElement) soundStatusElement.textContent = "Sound ready!";
                console.log("V5: Tone.Destination volume:", Tone.Destination.volume.value);
                console.log("V5: Tone.Destination muted:", Tone.Destination.mute);

                // V5: Quieter, more standard priming note, or can be removed if confident
                mainSynth.triggerAttackRelease('C5', '64n', Tone.now(), -45);
                console.log("V5: Audio priming note (C5) triggered.");

            }).catch(e => {
                console.error("V5: Tone.js audio context FAILED to start:", e);
                if (soundStatusElement) soundStatusElement.textContent = "Sound error. Tap again.";
            });
        }

        const particleRadius = Math.max(4, Math.min(renderWidth, renderHeight) * 0.014);
        const particle = Bodies.circle(x, y, particleRadius, {
            // --- V5: FURTHER ADJUSTED PARTICLE PHYSICS FOR LIVELINESS ---
            restitution: 0.82,          // Even more bouncy
            friction: 0.015,            // Even lower friction
            frictionAir: 0.002,         // Very low air friction
            density: 0.0006,           // Even lighter particles
            label: 'particle',
            render: { fillStyle: `hsl(${Math.random() * 360}, 90%, 70%)` }
        });
        particles.push(particle);
        World.add(world, particle);
    }

    function handleInteraction(eventX, eventY) {
        const rect = container.getBoundingClientRect();
        createParticle(eventX - rect.left, eventY - rect.top);
    }
    container.addEventListener('click', (event) => handleInteraction(event.clientX, event.clientY));
    container.addEventListener('touchstart', (event) => {
        if (event.target === container || container.contains(event.target)) {
             event.preventDefault();
        }
        for (let i = 0; i < event.changedTouches.length; i++) {
            handleInteraction(event.changedTouches[i].clientX, event.changedTouches[i].clientY);
        }
    }, { passive: false });

    Events.on(engine, 'collisionStart', (event) => {
        if (!audioStarted || Tone.context.state !== 'running') { return; }

        const pairs = event.pairs;
        let newLetterHitThisFrame = false;

        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
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
                volume = Math.min(-7, -16 + Math.log10(impactVelocity + 1) * 7); // Adjusted letter hit volume
                if (!recentlyHitLetters.has(hitChar)) {
                    recentlyHitLetters.add(hitChar); newLetterHitThisFrame = true;
                    setTimeout(() => recentlyHitLetters.delete(hitChar), letterHitResetTime);
                }
                const letterBody = bodyA.label.startsWith('letter-') ? bodyA : bodyB;
                const originalColor = letterBody.render.fillStyle;
                letterBody.render.fillStyle = '#FFFFFF';
                setTimeout(() => { letterBody.render.fillStyle = originalColor; }, 90); // Shorter flash

            } else if (bodyA.label === 'particle' && bodyB.label === 'particle') {
                noteToPlay = particleNotes[particleNoteIndex % particleNotes.length];
                particleNoteIndex++;
                const impactVelocity = Vector.magnitude(Vector.sub(bodyA.velocity, bodyB.velocity));
                volume = Math.min(-11, -21 + Math.log10(impactVelocity + 1) * 5); // Adjusted p-p volume
            }

            if (noteToPlay && Tone.context.state === 'running') {
                // --- V5: LONGER NOTE DURATION FOR CLICK REDUCTION ---
                soundSynthInstance.triggerAttackRelease(noteToPlay, '8t', Tone.now(), volume); // 8th note triplet
            }
        }

        if (newLetterHitThisFrame && recentlyHitLetters.size === letterChars.length) {
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

    Events.on(render, 'afterRender', () => { /* ... same text rendering ... */
        const context = render.context;
        context.fillStyle = 'rgba(0, 0, 0, 0.65)';
        const fontSize = Math.min(finalLetterHeight * 0.5, effectiveLetterWidth * 0.6);
        context.font = `bold ${fontSize}px Arial, sans-serif`;
        context.textAlign = 'center'; context.textBaseline = 'middle';
        letterBodies.forEach(body => {
            context.fillText(body.customChar, body.position.x, body.position.y);
        });
    });

    window.addEventListener('resize', () => { /* ... same basic resize ... */
        renderWidth = container.clientWidth; renderHeight = container.clientHeight;
        render.canvas.width = renderWidth; render.canvas.height = renderHeight;
        Render.setPixelRatio(render, window.devicePixelRatio || 1);
        console.log("Window resized. For optimal letter layout, refresh or implement full dynamic resize.");
    });

    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);

    if (instructionsDiv && soundStatusElement) {
         soundStatusElement.textContent = "Tap to begin creating music!";
    } else if (instructionsDiv) { /* ... same fallback ... */ }
    console.log("IWLYF Music-Physics Simulator V5 Initialized!");
});

document.addEventListener('DOMContentLoaded', () => {
    // Matter.js Modules
    const { Engine, Render, Runner, World, Bodies, Composite, Events, Vector } = Matter;

    // --- Tone.js Setup ---
    const mainSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.025, decay: 0.25, sustain: 0.2, release: 0.7 },
        volume: -9
    }).toDestination();

    const chordSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 },
        volume: -12
    }).toDestination();

    const reverb = new Tone.Reverb({
        decay: 1.2,
        wet: 0.0 // Reverb bypassed for click testing
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

    const engine = Engine.create(); // Ensure engine is created before use
    const world = engine.world;
    world.gravity.y = 0.3;

    const render = Render.create({
        element: container,
        engine: engine, // Pass the created engine to the renderer
        options: {
            width: renderWidth, height: renderHeight,
            wireframes: false, background: 'black',
            pixelRatio: window.devicePixelRatio || 1
        }
    });

    const wallThickness = 60;
    const wallOptions = { isStatic: true, label: 'wall', render: { fillStyle: '#101010' } };
    World.add(world, [
        Bodies.rectangle(renderWidth / 2, -wallThickness / 2 + 1, renderWidth + 2, wallThickness, { ...wallOptions }),
        Bodies.rectangle(renderWidth / 2, renderHeight + wallThickness / 2 - 1, renderWidth + 2, wallThickness, { ...wallOptions }),
        Bodies.rectangle(-wallThickness / 2 + 1, renderHeight / 2, wallThickness, renderHeight + 2, { ...wallOptions }),
        Bodies.rectangle(renderWidth + wallThickness / 2 - 1, renderHeight / 2, wallThickness, renderHeight + 2, { ...wallOptions })
    ]);

    const letterBodies = [];
    const letterConfig = {
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
        effectiveLetterWidth -= (reductionPerLetterBlock * 0.8);
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
                friction: 0.2, restitution: 0.6,
                render: { fillStyle: `hsl(${index * (360 / letterConfig.count)}, 70%, 75%)` }
            }
        );
        letterBodies.push(letterBody);
    });
    World.add(world, letterBodies);

    const particles = [];
    const clearButton = document.getElementById('clearButton');
    const muteButton = document.getElementById('muteButton');
    let isMuted = false;
    let audioStarted = false;
    let soundStatusElement = document.getElementById('soundStatus');

    function clearParticles() {
        while (particles.length) {
            const p = particles.pop();
            World.remove(world, p);
        }
    }

    function toggleMute() {
        isMuted = !isMuted;
        Tone.Destination.mute = isMuted;
        if (muteButton) {
            muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
        }
    }

    function createParticle(x, y) {
        if (!audioStarted) {
            console.log("V6.1: Attempting to start audio context...");
            const audioContext = Tone.getContext().rawContext;
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().then(() => console.log("V6.1: AudioContext explicitly resumed."))
                    .catch(e => console.error("V6.1: Error resuming existing AudioContext:", e));
            }
            Tone.start().then(() => {
                audioStarted = true;
                console.log("V6.1: Tone.js audio context is RUNNING!");
                if (instructionsDiv) instructionsDiv.style.display = 'none';
                if (soundStatusElement) soundStatusElement.textContent = "Sound ready!";
                console.log("V6.1: Tone.Destination volume:", Tone.Destination.volume.value);
                console.log("V6.1: Tone.Destination muted:", Tone.Destination.mute);

                // --- V6.1: Tone.Transport WARM-UP TEMPORARILY COMMENTED OUT ---
                /*
                if (Tone.Transport.state !== "started") {
                    Tone.Transport.start();
                    console.log("V6.1: Tone.Transport started.");
                }
                Tone.Transport.scheduleOnce((time) => {
                    console.log("V6.1: Transport warm-up event executed at", time);
                }, Tone.now() + 0.05);
                */
                console.log("V6.1: Tone.Transport warm-up is currently disabled for Matter.js testing.");


            }).catch(e => {
                console.error("V6.1: Tone.js audio context FAILED to start:", e);
                if (soundStatusElement) soundStatusElement.textContent = "Sound error. Tap again.";
            });
        }

        const particleRadius = Math.max(4, Math.min(renderWidth, renderHeight) * 0.014);
        const particle = Bodies.circle(x, y, particleRadius, {
            restitution: 0.82, friction: 0.015, frictionAir: 0.002,
            density: 0.0006, label: 'particle',
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
    if (clearButton) {
        clearButton.addEventListener('click', clearParticles);
    }
    if (muteButton) {
        muteButton.addEventListener('click', toggleMute);
    }

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
                volume = Math.min(-8, -17 + Math.log10(impactVelocity + 1) * 7);
                if (!recentlyHitLetters.has(hitChar)) {
                    recentlyHitLetters.add(hitChar); newLetterHitThisFrame = true;
                    setTimeout(() => recentlyHitLetters.delete(hitChar), letterHitResetTime);
                }
                const letterBody = bodyA.label.startsWith('letter-') ? bodyA : bodyB;
                const originalColor = letterBody.render.fillStyle;
                letterBody.render.fillStyle = '#FFFFFF';
                setTimeout(() => { letterBody.render.fillStyle = originalColor; }, 90);
            } else if (bodyA.label === 'particle' && bodyB.label === 'particle') {
                noteToPlay = particleNotes[particleNoteIndex % particleNotes.length];
                particleNoteIndex++;
                const impactVelocity = Vector.magnitude(Vector.sub(bodyA.velocity, bodyB.velocity));
                volume = Math.min(-12, -22 + Math.log10(impactVelocity + 1) * 5);
            }

            if (noteToPlay && Tone.context.state === 'running') {
                soundSynthInstance.triggerAttackRelease(noteToPlay, '8t', Tone.now(), volume);
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

    Events.on(render, 'afterRender', () => {
        const context = render.context;
        context.fillStyle = 'rgba(0, 0, 0, 0.65)';
        const fontSize = Math.min(finalLetterHeight * 0.5, effectiveLetterWidth * 0.6);
        context.font = `bold ${fontSize}px Arial, sans-serif`;
        context.textAlign = 'center'; context.textBaseline = 'middle';
        letterBodies.forEach(body => {
            context.fillText(body.customChar, body.position.x, body.position.y);
        });
    });

    window.addEventListener('resize', () => {
        renderWidth = container.clientWidth; renderHeight = container.clientHeight;
        render.canvas.width = renderWidth; render.canvas.height = renderHeight;
        Render.setPixelRatio(render, window.devicePixelRatio || 1);
        console.log("V6.1: Window resized. For optimal letter layout, refresh or implement full dynamic resize.");
    });

    // Ensure Runner is created correctly
    const runner = Runner.create();

    // Start rendering and physics engine
    Render.run(render);
    Runner.run(runner, engine); // Ensure engine is passed to runner

    if (instructionsDiv && soundStatusElement) {
        soundStatusElement.textContent = "Tap to begin creating music!";
    } else if (instructionsDiv) {
        let p = document.createElement('p');
        p.id = 'soundStatus';
        p.textContent = "Tap to begin creating music!";
        instructionsDiv.appendChild(p);
        soundStatusElement = p; // Assign it
    }
    console.log("IWLYF Music-Physics Simulator V6.1 (Patch Attempt) Initialized!");
});

document.addEventListener('DOMContentLoaded', () => {
    // Matter.js Modules
    const { Engine, Render, Runner, World, Bodies, Composite, Events, Vector } = Matter;

    // Tone.js Setup
    const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.6 },
        volume: -9 // Slightly increased volume for individual notes
    }).toDestination();

    const melodicImpactSynth = new Tone.MembraneSynth({
        pitchDecay: 0.03, octaves: 6, oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.8, attackCurve: "exponential" },
        volume: -6 // Slightly increased
    }).toDestination();

    const chordSynth = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 1.5,
        envelope: { attack: 0.1, decay: 0.2, sustain: 1.0, release: 1.2 },
        volume: -7 // Slightly increased
    }).toDestination();

    const reverb = new Tone.Reverb(0.5).toDestination(); // Slightly less reverb
    synth.connect(reverb);
    melodicImpactSynth.connect(reverb);
    chordSynth.connect(reverb);

    // Musical Scales and Notes
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
    const chordCooldown = 3500; // Slightly shorter cooldown
    const letterHitResetTime = 7000;

    // Simulation Setup
    const instructionsDiv = document.getElementById('instructions');
    const container = document.getElementById('simulation-container');
    let renderWidth = container.clientWidth;
    let renderHeight = container.clientHeight;

    const engine = Engine.create();
    const world = engine.world;
    world.gravity.y = 0.45; // << INCREASED GRAVITY

    const render = Render.create({
        element: container,
        engine: engine,
        options: {
            width: renderWidth, height: renderHeight,
            wireframes: false, background: 'black',
            pixelRatio: window.devicePixelRatio || 1 // For sharper rendering
        }
    });

    // Boundary Walls
    const wallThickness = 60;
    const wallOptions = { isStatic: true, label: 'wall', render: { fillStyle: '#101010' } };
    World.add(world, [
        Bodies.rectangle(renderWidth / 2, -wallThickness / 2 + 1, renderWidth + 2, wallThickness, { ...wallOptions }),
        Bodies.rectangle(renderWidth / 2, renderHeight + wallThickness / 2 - 1, renderWidth + 2, wallThickness, { ...wallOptions }),
        Bodies.rectangle(-wallThickness / 2 + 1, renderHeight / 2, wallThickness, renderHeight + 2, { ...wallOptions }),
        Bodies.rectangle(renderWidth + wallThickness / 2 - 1, renderHeight / 2, wallThickness, renderHeight + 2, { ...wallOptions })
    ]);

    // --- ADJUSTED LETTER SIZING AND POSITIONING ---
    const letterBodies = [];
    const letterConfig = {
        count: letterChars.length,
        yPosRatio: 0.28, // Position letters a bit higher (28% from top)
        baseWidthToScreenRatio: 0.1, // Base width of a letter as a ratio of screen width
        maxWidth: 60,
        minWidth: 25, // Min width especially for very narrow screens
        aspectRatio: 1.5, // height = width * 1.5
        minSpacingToWidthRatio: 0.4 // Minimum spacing between letters relative to letter width
    };

    let effectiveLetterWidth = Math.min(letterConfig.maxWidth, renderWidth * letterConfig.baseWidthToScreenRatio);
    effectiveLetterWidth = Math.max(letterConfig.minWidth, effectiveLetterWidth);
    const effectiveLetterHeight = effectiveLetterWidth * letterConfig.aspectRatio;

    const totalLetterBlockWidth = letterConfig.count * effectiveLetterWidth;
    const minTotalSpacingWidth = (letterConfig.count + 1) * (effectiveLetterWidth * letterConfig.minSpacingToWidthRatio);

    let availableWidthForLettersAndSpacing = renderWidth * 0.95; // Use 95% of container width

    // If calculated total width (letters + min spacing) is too large, scale down letter width
    if (totalLetterBlockWidth + minTotalSpacingWidth > availableWidthForLettersAndSpacing) {
        let excess = (totalLetterBlockWidth + minTotalSpacingWidth) - availableWidthForLettersAndSpacing;
        let reductionPerLetterBlock = excess / letterConfig.count; // Spread reduction across letters
        effectiveLetterWidth -= (reductionPerLetterBlock*0.8); // Reduce width, 0.8 factor for adjustment
        effectiveLetterWidth = Math.max(letterConfig.minWidth, effectiveLetterWidth); // Re-check minWidth
    }
    // Recalculate height based on potentially new width
    const finalLetterHeight = effectiveLetterWidth * letterConfig.aspectRatio;

    const finalTotalLetterWidth = letterConfig.count * effectiveLetterWidth;
    const spacingUnit = (availableWidthForLettersAndSpacing - finalTotalLetterWidth) / (letterConfig.count + 1);

    const letterYPosition = renderHeight * letterConfig.yPosRatio;

    letterChars.forEach((char, index) => {
        const xPos = (spacingUnit * (index + 1)) + (effectiveLetterWidth * index) + (effectiveLetterWidth / 2) + (renderWidth * 0.025); // Centering adjustment based on 95% usage

        const letterBody = Bodies.rectangle(
            xPos, letterYPosition, effectiveLetterWidth, finalLetterHeight, {
                isStatic: true, label: `letter-${char}`, customChar: char,
                friction: 0.3, restitution: 0.5,
                render: { fillStyle: `hsl(${index * (360 / letterConfig.count)}, 70%, 75%)` }
            }
        );
        letterBodies.push(letterBody);
    });
    World.add(world, letterBodies);
    // --- END OF ADJUSTED LETTER SIZING ---

    // Particle Creation
    const particles = [];
    let audioStarted = false;
    let soundStatusElement = document.getElementById('soundStatus'); // For user feedback

    function createParticle(x, y) {
        if (!audioStarted) {
            console.log("Attempting to start audio context due to user gesture...");
            Tone.start().then(() => {
                audioStarted = true;
                console.log("Tone.js audio context is RUNNING!");
                if (instructionsDiv) instructionsDiv.style.display = 'none'; // Hide instructions
                if (soundStatusElement) soundStatusElement.textContent = "Sound enabled!";
                // Test sound immediately after context starts
                // melodicImpactSynth.triggerAttackRelease("C4", "8n", Tone.now(), -10);
            }).catch(e => {
                console.error("Tone.js audio context FAILED to start:", e);
                if (soundStatusElement) soundStatusElement.textContent = "Error starting sound. Please tap again.";
            });
        }

        const particleRadius = Math.max(4, Math.min(renderWidth, renderHeight) * 0.013);
        const particle = Bodies.circle(x, y, particleRadius, {
            restitution: 0.55, friction: 0.05, density: 0.002, label: 'particle',
            render: { fillStyle: `hsl(${Math.random() * 360}, 85%, 75%)` }
        });
        particles.push(particle);
        World.add(world, particle);

        setTimeout(() => {
            World.remove(world, particle);
            const index = particles.indexOf(particle);
            if (index > -1) particles.splice(index, 1);
        }, 10000); // Particles last 10 seconds
    }

    // Event Listeners for Particle Creation
    function handleInteraction(eventX, eventY) {
        const rect = container.getBoundingClientRect();
        createParticle(eventX - rect.left, eventY - rect.top);
    }

    container.addEventListener('click', (event) => {
        handleInteraction(event.clientX, event.clientY);
    });
    // Adding passive: true can sometimes help with performance, but for audio start, explicit control is key.
    // For touchstart, we NEED it to be non-passive if we want to preventDefault and reliably start audio.
    container.addEventListener('touchstart', (event) => {
        // Crucial for iOS: prevent default page scroll/zoom IF the touch is within the sim container
        // This helps ensure the gesture is "captured" for audio.
        if (event.target === container || container.contains(event.target)) {
             event.preventDefault();
        }
        for (let i = 0; i < event.changedTouches.length; i++) {
            handleInteraction(event.changedTouches[i].clientX, event.changedTouches[i].clientY);
        }
    }, { passive: false }); // Explicitly false for audio unlock potential


    // Collision Handling
    Events.on(engine, 'collisionStart', (event) => {
        if (!audioStarted || Tone.context.state !== 'running') {
            // console.log("Collision event ignored: Audio not ready or context suspended.");
            return;
        }

        const pairs = event.pairs;
        let newLetterHitThisFrame = false;

        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;

            let noteToPlay = null;
            let soundSynthInstance = synth;
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
                soundSynthInstance = melodicImpactSynth;
                const impactVelocity = particleBody ? Vector.magnitude(particleBody.velocity) : 1;
                volume = Math.min(-3, -18 + Math.log10(impactVelocity + 1) * 9);

                if (!recentlyHitLetters.has(hitChar)) {
                    recentlyHitLetters.add(hitChar);
                    newLetterHitThisFrame = true;
                    setTimeout(() => recentlyHitLetters.delete(hitChar), letterHitResetTime);
                }
                const letterBody = bodyA.label.startsWith('letter-') ? bodyA : bodyB;
                const originalColor = letterBody.render.fillStyle;
                letterBody.render.fillStyle = '#FFFFFF';
                setTimeout(() => { letterBody.render.fillStyle = originalColor; }, 120);

            } else if (bodyA.label === 'particle' && bodyB.label === 'particle') {
                noteToPlay = particleNotes[particleNoteIndex % particleNotes.length];
                particleNoteIndex++;
                const impactVelocity = Vector.magnitude(Vector.sub(bodyA.velocity, bodyB.velocity));
                volume = Math.min(-10, -22 + Math.log10(impactVelocity + 1) * 6);
            }

            if (noteToPlay && Tone.context.state === 'running') { // Double check audio context
                soundSynthInstance.triggerAttackRelease(noteToPlay, '16n', Tone.now(), volume); // Shorter note duration
            }
        }

        if (newLetterHitThisFrame && recentlyHitLetters.size === letterChars.length) {
            const now = Tone.now() * 1000;
            if (now - lastChordTime > chordCooldown) {
                const currentChord = chordProgression[chordIndex % chordProgression.length];
                if (Tone.context.state === 'running') { // Double check
                    chordSynth.triggerAttackRelease(currentChord, '0.8n', Tone.now()); // Chord duration
                }
                chordIndex++;
                recentlyHitLetters.clear();
                lastChordTime = now;
                container.style.boxShadow = '0 0 35px rgba(150, 230, 255, 0.9)';
                setTimeout(() => { container.style.boxShadow = '0 0 15px rgba(128, 128, 255, 0.3)'; }, 800);
            }
        }
    });

    // Drawing Text on Letters
    Events.on(render, 'afterRender', () => {
        const context = render.context;
        context.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Darker text for better contrast on bright letters
        // Use the dynamically calculated effectiveLetterWidth and finalLetterHeight
        const fontSize = Math.min(finalLetterHeight * 0.55, effectiveLetterWidth * 0.65);
        context.font = `bold ${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        letterBodies.forEach(body => {
            context.fillText(body.customChar, body.position.x, body.position.y);
        });
    });

    // Handle window resize (basic canvas update)
    window.addEventListener('resize', () => {
        // This is a simplified resize. For perfect resizing, letter positions and physics
        // bodies would need to be recalculated and potentially replaced.
        // For now, we mainly update the renderer dimensions.
        renderWidth = container.clientWidth;
        renderHeight = container.clientHeight;
        render.canvas.width = renderWidth;
        render.canvas.height = renderHeight;
        Render.setPixelRatio(render, window.devicePixelRatio || 1);

        // Re-calculate and update letter positions/sizes on resize
        // (This is more involved - for a truly robust solution, you'd re-run the letter creation logic)
        // For this iteration, we'll note it's a known area for more advanced improvement.
        console.log("Window resized. For optimal letter layout, refresh might be needed or implement full dynamic resize.");
    });

    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);

    // Initial message in instructions div
    if (instructionsDiv && soundStatusElement) { // Check if soundStatusElement was found
         soundStatusElement.textContent = "Tap to start sound & simulation.";
    } else if (instructionsDiv) { // Fallback if soundStatusElement somehow isn't there
        let p = document.createElement('p');
        p.id = 'soundStatus';
        p.textContent = "Tap to start sound & simulation.";
        instructionsDiv.appendChild(p);
        soundStatusElement = p; // Assign it
    }

    console.log("IWLYF Music-Physics Simulator V2 Initialized!");
});

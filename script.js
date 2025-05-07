document.addEventListener('DOMContentLoaded', () => {
    // Matter.js Modules
    const { Engine, Render, Runner, World, Bodies, Composite, Events, Vector } = Matter;

    // Tone.js Setup
    const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' }, // sine, triangle, sawtooth, square
        envelope: {
            attack: 0.02,
            decay: 0.1,
            sustain: 0.3,
            release: 0.6,
        },
        volume: -8 // Base volume for individual notes
    }).toDestination();

    const melodicImpactSynth = new Tone.MembraneSynth({ // For a softer, more melodic impact on letters
        pitchDecay: 0.03,
        octaves: 6,
        oscillator: { type: "sine" },
        envelope: {
            attack: 0.001,
            decay: 0.3,
            sustain: 0.01,
            release: 0.8,
            attackCurve: "exponential"
        },
        volume: -5
    }).toDestination();


    const chordSynth = new Tone.PolySynth(Tone.AMSynth, { // A different synth for chords
        harmonicity: 1.5,
        envelope: {
            attack: 0.1,
            decay: 0.2,
            sustain: 1.0,
            release: 1.2,
        },
        volume: -6 // Base volume for chords
    }).toDestination();

    const reverb = new Tone.Reverb(0.6).toDestination(); // A bit of reverb
    synth.connect(reverb);
    melodicImpactSynth.connect(reverb);
    chordSynth.connect(reverb);


    // Musical Scales and Notes
    const baseNotesForKey = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3']; // Example: C Major scale base notes
    const particleNotes = [ // Pentatonic-like, pleasant sounding
        'C4', 'D4', 'E4', 'G4', 'A4',
        'C5', 'D5', 'E5', 'G5', 'A5'
    ];
    let particleNoteIndex = 0;

    const letterChars = ['I', 'W', 'L', 'Y', 'F'];
    const letterNotes = { // Assigning specific notes to letters
        'I': 'C4',
        'W': 'E4',
        'L': 'G4',
        'Y': 'A4', // Kept A4 as per original, could be higher like A5
        'F': 'C5'
    };

    // Chord Progression (using notes that should sound good with the letter notes)
    // Example: I-V-vi-IV in C Major (C, G, Am, F)
    const chordProgression = [
        ['C4', 'E4', 'G4'],    // C Major
        ['G4', 'B4', 'D5'],    // G Major
        ['A3', 'C4', 'E4'],    // A minor (using A3 for a fuller sound)
        ['F3', 'A3', 'C4']     // F Major (using F3 and A3)
    ];
    let chordIndex = 0;
    let recentlyHitLetters = new Set();
    let lastChordTime = 0;
    const chordCooldown = 4000; // 4 seconds between chords
    const letterHitResetTime = 8000; // Time window to hit all letters for a chord

    // Simulation Setup
    const instructionsDiv = document.getElementById('instructions');
    const container = document.getElementById('simulation-container');
    let renderWidth = container.clientWidth;
    let renderHeight = container.clientHeight;

    const engine = Engine.create();
    const world = engine.world;
    world.gravity.y = 0.15; // Softer gravity

    const render = Render.create({
        element: container,
        engine: engine,
        options: {
            width: renderWidth,
            height: renderHeight,
            wireframes: false,
            background: 'black',
        }
    });

    // Boundary Walls
    const wallThickness = 50; // Making walls thicker and outside the view slightly
    const wallOptions = {
        isStatic: true,
        label: 'wall',
        render: {
            fillStyle: '#111' // Dark grey, almost black
        }
    };
    World.add(world, [
        Bodies.rectangle(renderWidth / 2, -wallThickness / 2, renderWidth, wallThickness, { ...wallOptions }), // Top
        Bodies.rectangle(renderWidth / 2, renderHeight + wallThickness / 2, renderWidth, wallThickness, { ...wallOptions }), // Bottom
        Bodies.rectangle(-wallThickness / 2, renderHeight / 2, wallThickness, renderHeight, { ...wallOptions }), // Left
        Bodies.rectangle(renderWidth + wallThickness / 2, renderHeight / 2, wallThickness, renderHeight, { ...wallOptions })  // Right
    ]);

    // Create Letter Bodies
    const letterBodies = [];
    const numLetters = letterChars.length;
    const letterWidth = Math.min(renderWidth / (numLetters + 2), 60); // Responsive letter width
    const letterHeight = letterWidth * 1.5;
    const letterYPosition = renderHeight * 0.3; // Position them a bit higher

    letterChars.forEach((char, index) => {
        const xPos = (renderWidth / (numLetters + 1)) * (index + 1);
        const letterBody = Bodies.rectangle(
            xPos,
            letterYPosition,
            letterWidth,
            letterHeight,
            {
                isStatic: true,
                label: `letter-${char}`,
                customChar: char, // Store the character for easy lookup
                friction: 0.3,
                restitution: 0.5,
                render: {
                    fillStyle: `hsl(${index * (360 / numLetters)}, 60%, 70%)` // Unique color for each letter block
                }
            }
        );
        letterBodies.push(letterBody);
    });
    World.add(world, letterBodies);

    // Particle Creation
    const particles = [];
    let audioStarted = false;

    function createParticle(x, y) {
        if (!audioStarted && Tone.context.state !== 'running') {
            Tone.start().then(() => {
                console.log("Audio context started!");
                audioStarted = true;
                instructionsDiv.style.display = 'none'; // Hide instructions after first tap
            }).catch(e => console.error("Error starting Tone.js", e));
        }

        const particleRadius = Math.max(5, Math.min(renderWidth, renderHeight) * 0.015); // Responsive radius
        const particle = Bodies.circle(x, y, particleRadius, {
            restitution: 0.6, // Bouncier particles
            friction: 0.05,
            density: 0.002,
            label: 'particle',
            render: {
                fillStyle: `hsl(${Math.random() * 360}, 80%, 70%)`
            }
        });
        particles.push(particle);
        World.add(world, particle);

        setTimeout(() => {
            World.remove(world, particle);
            const index = particles.indexOf(particle);
            if (index > -1) {
                particles.splice(index, 1);
            }
        }, 12000); // Particles last for 12 seconds
    }

    // Event Listeners for Particle Creation
    container.addEventListener('click', (event) => {
        const rect = container.getBoundingClientRect();
        createParticle(event.clientX - rect.left, event.clientY - rect.top);
    });
    container.addEventListener('touchstart', (event) => {
        event.preventDefault(); // Prevent default touch behavior (like scrolling or zooming)
        const rect = container.getBoundingClientRect();
        for (let i = 0; i < event.changedTouches.length; i++) {
            createParticle(event.changedTouches[i].clientX - rect.left, event.changedTouches[i].clientY - rect.top);
        }
    }, { passive: false });


    // Collision Handling
    Events.on(engine, 'collisionStart', (event) => {
        if (!audioStarted) return; // Don't process collisions if audio isn't ready

        const pairs = event.pairs;
        let newLetterHitThisFrame = false;

        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;

            let noteToPlay = null;
            let soundSynth = synth; // Default synth
            let volume = -12; // Default volume for particle-particle

            let hitChar = null;
            let particleBody = null;

            if (bodyA.label.startsWith('letter-') && bodyB.label === 'particle') {
                hitChar = bodyA.customChar;
                particleBody = bodyB;
            } else if (bodyB.label.startsWith('letter-') && bodyA.label === 'particle') {
                hitChar = bodyB.customChar;
                particleBody = bodyA;
            }

            if (hitChar) {
                noteToPlay = letterNotes[hitChar];
                soundSynth = melodicImpactSynth; // Use special synth for letter hits
                const impactVelocity = particleBody ? Vector.magnitude(particleBody.velocity) : 1;
                volume = Math.min(-2, -15 + Math.log10(impactVelocity + 1) * 8); // Louder for faster impacts

                if (!recentlyHitLetters.has(hitChar)) {
                    recentlyHitLetters.add(hitChar);
                    newLetterHitThisFrame = true;
                    // Set a timeout to remove this letter from the "recently hit" set
                    // This encourages hitting all letters within a certain window
                    setTimeout(() => {
                        recentlyHitLetters.delete(hitChar);
                    }, letterHitResetTime);
                }
                 // Flash letter color on hit
                const letterBody = bodyA.label.startsWith('letter-') ? bodyA : bodyB;
                const originalColor = letterBody.render.fillStyle;
                letterBody.render.fillStyle = '#FFFFFF'; // Flash white
                setTimeout(() => {
                    letterBody.render.fillStyle = originalColor;
                }, 150);


            } else if (bodyA.label === 'particle' && bodyB.label === 'particle') {
                noteToPlay = particleNotes[particleNoteIndex % particleNotes.length];
                particleNoteIndex++;
                const impactVelocity = Vector.magnitude(Vector.sub(bodyA.velocity, bodyB.velocity));
                volume = Math.min(-10, -20 + Math.log10(impactVelocity + 1) * 5);
            } else if (
                (bodyA.label === 'particle' && bodyB.label === 'wall') ||
                (bodyB.label === 'particle' && bodyA.label === 'wall')
            ) {
                // Optional: Sound for hitting walls
                // noteToPlay = 'C2'; // Low thud
                // volume = -25;
            }


            if (noteToPlay && Tone.context.state === 'running') {
                soundSynth.triggerAttackRelease(noteToPlay, '8n', Tone.now(), volume);
            }
        }

        // Check for "doing well" - all letters hit
        if (newLetterHitThisFrame && recentlyHitLetters.size === letterChars.length) {
            const now = Tone.now() * 1000; // For cooldown comparison
            if (now - lastChordTime > chordCooldown) {
                const currentChord = chordProgression[chordIndex % chordProgression.length];
                if (Tone.context.state === 'running') {
                    chordSynth.triggerAttackRelease(currentChord, '1n', Tone.now()); // Play chord
                }
                chordIndex++;
                recentlyHitLetters.clear(); // Reset for the next chord attempt
                lastChordTime = now;

                // Visual feedback for chord
                container.style.boxShadow = '0 0 30px rgba(128, 220, 255, 0.8)';
                setTimeout(() => {
                     container.style.boxShadow = '0 0 15px rgba(128, 128, 255, 0.3)';
                }, 1000);
            }
        }
    });

    // Drawing Text on Letters after Matter.js renders
    Events.on(render, 'afterRender', () => {
        const context = render.context;
        context.fillStyle = 'rgba(255, 255, 255, 0.9)'; // Text color
        const fontSize = Math.min(letterHeight * 0.6, letterWidth * 0.8); // Responsive font size
        context.font = `bold ${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        letterBodies.forEach(body => {
            context.fillText(body.customChar, body.position.x, body.position.y);
        });
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        renderWidth = container.clientWidth;
        renderHeight = container.clientHeight;
        render.canvas.width = renderWidth;
        render.canvas.height = renderHeight;
        Render.setPixelRatio(render, window.devicePixelRatio); // For crisp rendering on high DPI

        // Update wall positions and sizes (this is simplified, might need more robust update)
        // For a full resize, you'd typically re-create or update all static bodies.
        // For simplicity here, we're mainly adjusting canvas.
        // True dynamic resizing of physics bodies is more complex.
        // Let's assume for now the initial setup is on a reasonably sized window.
        // A more robust solution would involve removing and re-adding scaled bodies.
        // For now, just ensure the rendering canvas is updated.
        Composite.allBodies(world).forEach(body => {
            if (body.label === 'wall') {
                // This is tricky, ideally you'd scale positions and dimensions
                // or remove and re-add. For now, we'll leave walls as is,
                // knowing this might cause issues if the aspect ratio drastically changes.
            }
        });
         // Re-calculate letter positions/sizes if needed or accept they scale with viewport via initial settings.
    });


    // Run the renderer and engine
    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);

    console.log("IWLYF Music-Physics Simulator Initialized!");
});

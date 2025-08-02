let actorsOnMap = [];
let actorsByType = {};
let pointerGraphics = null;
let lastZoom = null;
let debounceTimeout = null;
let baseRadius = 40; // Default value

Hooks.once('init', () => {
    // Base radius setting
    game.settings.register('bettermapawarness', 'baseRadius', {
        name: 'Base Circle Radius',
        hint: 'The base size of the circle indicators (default: 40)',
        scope: 'client',
        config: true,
        type: Number,
        default: 40,
        range: {
            min: 10,
            max: 200,
            step: 5
        },
        onChange: value => {
            baseRadius = value;
            drawPointersForActors();
        }
    });

    // Color settings for different actor types
    game.settings.register('bettermapawarness', 'characterColor', {
        name: "Character Circle Color",
        hint: "The color used for player character circles on the map",
        scope: "client",
        config: true,
        type: new game.colorPicker.ColorPickerField({format: "hex"}),
        default: "#ff0000"
    });

    game.settings.register('bettermapawarness', 'npcColor', {
        name: "NPC Circle Color",
        hint: "The color used for NPC circles on the map",
        scope: "client",
        config: true,
        type: new game.colorPicker.ColorPickerField({format: "hex"}),
        default: "#00ff00"
    });

    // other types
    game.settings.register('bettermapawarness', 'otherColor', {
        name: "Other Circle Color",
        hint: "The color used for other actor circles on the map",
        scope: "client",
        config: true,
        type: new game.colorPicker.ColorPickerField({format: "hex"}),
        default: "#ffff00"
    });
});

// Aktualizuje aktorów na mapie i według typu
function updateActorsOnMap() {
    const tokens = canvas.tokens.placeables;
    actorsOnMap = tokens.map(token => token.actor).filter(Boolean);

    actorsByType = actorsOnMap.reduce((acc, actor) => {
        (acc[actor.type] ??= []).push(actor);
        return acc;
    }, {});
}

// Rysuje wskaźniki dla aktorów gdy zoom < 0.3
function drawPointersForActors() {
    const zoom = canvas.stage.scale.x;
    if (zoom === lastZoom) return;
    lastZoom = zoom;
    removePointers();
    if (zoom >= 0.9) return;

    pointerGraphics = new PIXI.Graphics();
    pointerGraphics.zIndex = 10000;
    canvas.stage.addChild(pointerGraphics);

    for (const token of canvas.tokens.placeables) {
        const actor = token.actor;
        if (!actor) continue;

        let color;
        switch (actor.type) {
            case 'character': 
                color = parseInt(game.settings.get('bettermapawarness', 'characterColor').replace('#', '0x'));
                break;
            case 'npc': 
                color = parseInt(game.settings.get('bettermapawarness', 'npcColor').replace('#', '0x'));
                break;
            default: 
                color = parseInt(game.settings.get('bettermapawarness', 'otherColor').replace('#', '0x'));
                break;
        }
        
        const radius = game.settings.get('bettermapawarness', 'baseRadius');
        const circleRadius = radius / zoom * 0.3;
        pointerGraphics.beginFill(color, 1);
        pointerGraphics.drawCircle(token.center.x, token.center.y, circleRadius);
        pointerGraphics.endFill();
    }
}

// Usuwa wskaźniki
function removePointers() {
    if (pointerGraphics) {
        canvas.stage.removeChild(pointerGraphics);
        pointerGraphics.destroy();
        pointerGraphics = null;
    }
}

// Debounce dla częstych hooków
function debounceRefresh() {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        updateActorsOnMap();
        drawPointersForActors();
    }, 100); // 100ms debounce
}

// Hooki
Hooks.once('init', () => {});
Hooks.once('ready', debounceRefresh);
Hooks.on('canvasReady', debounceRefresh);
Hooks.on('updateScene', debounceRefresh);

const actorTokenHooks = [
    'createActor', 'deleteActor',
    'createToken', 'deleteToken', 'updateToken'
];
actorTokenHooks.forEach(hook => Hooks.on(hook, debounceRefresh));

Hooks.on('canvasPan', debounceRefresh);


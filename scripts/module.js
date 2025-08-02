let actorsOnMap = [];
let actorsByType = {};
let pointerGraphics = null;
let lastZoom = null;
let debounceTimeout = null;
let baseRadius = 40; // Default value
let selectedTokenIds = new Set(); // Store multiple selected token IDs

// Handle token selection for GMs
function handleTokenSelection(token, controlled) {
    if (!game.user.isGM) return;
    
    // Update selection based on control state
    if (controlled) {
        selectedTokenIds.add(token.id); // Add new token to selection
    } else {
        selectedTokenIds.delete(token.id); // Remove token from selection
    }
    
    // Force refresh of pointers
    lastZoom = null; // Reset zoom to force redraw
    drawPointersForActors();
}

// Cache for performance optimization
const colorCache = {
    yourCharacter: null,
    selectedCharacter: null,
    character: null,
    npc: null,
    other: null
};

// Update color cache
function updateColorCache() {
    colorCache.yourCharacter = parseInt(game.settings.get('bettermapawarness', 'yourCharacterColor').replace('#', '0x'));
    colorCache.selectedCharacter = parseInt(game.settings.get('bettermapawarness', 'selectedCharacterColor').replace('#', '0x'));
    colorCache.character = parseInt(game.settings.get('bettermapawarness', 'characterColor').replace('#', '0x'));
    colorCache.npc = parseInt(game.settings.get('bettermapawarness', 'npcColor').replace('#', '0x'));
    colorCache.other = parseInt(game.settings.get('bettermapawarness', 'otherColor').replace('#', '0x'));
}

Hooks.once('init', () => {

    // zoom level setting
    game.settings.register('bettermapawarness', 'zoomLevel', {
        name: 'Zoom Level for Pointers',
        hint: 'Zoom level below which pointers will be displayed (default: 0.9)',
        scope: 'client',
        config: true,
        type: Number,
        default: 0.9,
        range: {
            min: 0.1,
            max: 2.0,
            step: 0.1
        },
        onChange: value => {
            lastZoom = null; // Reset last zoom to force redraw
            updateActorsOnMap();
            drawPointersForActors();
        }
    });
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

    // Your Character Circle Color
    game.settings.register('bettermapawarness', 'yourCharacterColor', {
        name: "Your Character Circle Color",
        hint: "The color used for your character's circle on the map",
        scope: "client",
        config: true,
        type: new game.colorPicker.ColorPickerField({format: "hex"}),
        default: "#177Fff",
        onChange: () => {
            updateColorCache();
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
        default: "#00ff00",
        onChange: () => {
            updateColorCache();
            drawPointersForActors();
        }
    });

    game.settings.register('bettermapawarness', 'npcColor', {
        name: "NPC Circle Color",
        hint: "The color used for NPC circles on the map",
        scope: "client",
        config: true,
        type: new game.colorPicker.ColorPickerField({format: "hex"}),
        default: "#ff0000",
        onChange: () => {
            updateColorCache();
            drawPointersForActors();
        }
    });

    // other types
    game.settings.register('bettermapawarness', 'otherColor', {
        name: "Other Circle Color",
        hint: "The color used for other actor circles on the map",
        scope: "client",
        config: true,
        type: new game.colorPicker.ColorPickerField({format: "hex"}),
        default: "#ffff00",
        onChange: () => {
            updateColorCache();
            drawPointersForActors();
        }
    });

    // GM Selected Character Color
    game.settings.register('bettermapawarness', 'selectedCharacterColor', {
        name: "Selected Character Color",
        hint: "The color used for the GM-selected character (GM Only)",
        scope: "client",
        config: true,
        type: new game.colorPicker.ColorPickerField({format: "hex"}),
        default: "#ff69b4", // Pink
        onChange: () => {
            updateColorCache();
            drawPointersForActors();
        }
    });

    // Use Player Colors Setting
    game.settings.register('bettermapawarness', 'usePlayerColors', {
        name: "Use Player Colors",
        hint: "Use player-specific colors for their tokens instead of default character colors",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => {
            drawPointersForActors();
        }
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

// Rysuje wskaźniki dla aktorów gdy zoom < 0.9
function drawPointersForActors() {
    const zoom = canvas.stage.scale.x;
    if (zoom === lastZoom) return;
    lastZoom = zoom;
    removePointers();
    if (zoom >= 0.9) return;

    // Create graphics object and add to canvas
    pointerGraphics = new PIXI.Graphics();
    pointerGraphics.zIndex = 10000;
    canvas.stage.addChild(pointerGraphics);

    // Calculate circle radius once
    const circleRadius = baseRadius / zoom * 0.3;

    // Group tokens by type for batch rendering

    // Group tokens by type for batch rendering
    const tokensByType = {
        yourCharacter: [],
        selectedCharacter: [],
        character: [],
        npc: [],
        other: []
    };

    // Sort tokens into groups
    for (const token of canvas.tokens.placeables) {
        if (!token.actor) continue;
        
        // Skip tokens that aren't visible to non-GM players
        if (!game.user.isGM && !token.isVisible) continue;
        
        // Check if this is the user's character
        const isYourCharacter = token.actor.type === 'character' && 
                               token.actor.isOwner && 
                               game.users.current.character?.id === token.actor.id;
                               
        // Check if this is one of the GM-selected tokens
        const isSelectedToken = game.user.isGM && selectedTokenIds.has(token.id);

        const type = isYourCharacter ? 'yourCharacter' :
                    isSelectedToken ? 'selectedCharacter' :
                    token.actor.type === 'character' ? 'character' :
                    token.actor.type === 'npc' ? 'npc' : 'other';
        tokensByType[type].push(token);
    }

    // Batch render each type
    for (const [type, tokens] of Object.entries(tokensByType)) {
        if (tokens.length === 0) continue;
        
        // Determine color based on settings and token ownership
        let color;
        const usePlayerColors = game.settings.get('bettermapawarness', 'usePlayerColors');
        
        if (usePlayerColors && (type === 'character' || type === 'yourCharacter')) {
            // For each token, find its color based on character assignment or ownership
            pointerGraphics.beginFill(0x000000, 1); // Start with a dummy fill
            for (const token of tokens) {
                // First try to find a user who has this actor as their character
                let ownerUser = Array.from(game.users).find(user => 
                    user.character?.id === token.actor?.id
                );
                
                // If no user has this as their character, fall back to ownership
                if (!ownerUser) {
                    const primaryOwner = Object.entries(token.actor?.ownership || {})
                        .find(([id, level]) => level === 3 && id !== 'default')?.[0];
                    ownerUser = game.users.get(primaryOwner);
                }
                let tokenColor = colorCache.character; // Default fallback color
                
                // Try to get user's color, with fallbacks
                if (ownerUser) {
                    try {
                        let userColor = ownerUser.color;
                        
                        // If no color set, try to get from user data
                        if (!userColor && ownerUser.data) {
                            userColor = ownerUser.data.color || ownerUser.data?.flags?.color;
                        }
                        
                        // If we have a color, process it
                        if (userColor) {
                            // Handle color string format
                            let colorString = userColor.toString();
                            if (colorString.startsWith('#')) {
                                colorString = '0x' + colorString.slice(1);
                            } else if (!colorString.startsWith('0x')) {
                                colorString = '0x' + colorString;
                            }
                            
                            const parsed = parseInt(colorString);
                            if (!isNaN(parsed)) {
                                tokenColor = parsed;
                            }
                        }
                    } catch (e) {
                        console.debug(`Could not parse color for user ${ownerUser.name}, using default`);
                    }
                }
                
                // If it's the current user's token, make it brighter/more visible
                const isSelfOwned = ownerUser?.id === game.user.id || game.users.current.character?.id === token.actor?.id;
                pointerGraphics.beginFill(tokenColor, isSelfOwned ? 1 : 0.8);
                pointerGraphics.drawCircle(token.center.x, token.center.y, circleRadius);
                pointerGraphics.endFill();
            }
            continue; // Skip the default batch rendering
        } else {
            // Use default cached colors
            color = type === 'yourCharacter' ? colorCache.yourCharacter :
                   type === 'selectedCharacter' ? colorCache.selectedCharacter :
                   type === 'character' ? colorCache.character :
                   type === 'npc' ? colorCache.npc : 
                   colorCache.other;
        }
        
        // Draw all circles of same type at once
        pointerGraphics.beginFill(color, 1);
        for (const token of tokens) {
            pointerGraphics.drawCircle(token.center.x, token.center.y, circleRadius);
        }
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
Hooks.once('ready', () => {
    updateColorCache();
    debounceRefresh();
    
    // Add listeners for token selection and deselection
    if (game.user.isGM) {
        // Handle individual token selection
        Hooks.on('controlToken', (token, controlled) => {
            handleTokenSelection(token, controlled);
        });

        // Handle mass token selection/deselection
        Hooks.on('clearTokens', () => {
            selectedTokenIds.clear();
            drawPointersForActors();
        });
    }


});
Hooks.on('canvasReady', debounceRefresh);
Hooks.on('updateScene', debounceRefresh);

const actorTokenHooks = [
    'createActor', 'deleteActor',
    'createToken', 'deleteToken', 'updateToken'
];
actorTokenHooks.forEach(hook => Hooks.on(hook, debounceRefresh));

Hooks.on('canvasPan', debounceRefresh);

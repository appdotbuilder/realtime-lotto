import { type DrawEvent } from '../schema';

// Mock database storage for testing purposes
const mockGames: any[] = [];
const mockPlayers: any[] = [];
const mockDrawEvents: any[] = [];

let nextGameId = 1;
let nextPlayerId = 1;
let nextDrawEventId = 1;

export async function drawNumber(gameId: number): Promise<DrawEvent> {
  try {
    // 1. Find the game by ID
    const game = mockGames.find(g => g.id === gameId);

    if (!game) {
      throw new Error('Game not found');
    }

    // 2. Validate the game is in 'in_progress' status
    if (game.status !== 'in_progress') {
      throw new Error('Game is not in progress');
    }

    // 3. Check current draw_order (should be 0-4 for positions 1-5)
    if (game.draw_order >= 5) {
      throw new Error('All numbers have already been drawn');
    }

    // Parse existing drawn numbers
    const drawnNumbers: number[] = Array.isArray(game.drawn_numbers) 
      ? game.drawn_numbers 
      : JSON.parse(game.drawn_numbers || '[]');

    // 4. Generate a random number (1-50) that hasn't been drawn yet
    const availableNumbers = Array.from({ length: 50 }, (_, i) => i + 1)
      .filter(num => !drawnNumbers.includes(num));

    if (availableNumbers.length === 0) {
      throw new Error('No available numbers to draw');
    }

    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    const drawnNumber = availableNumbers[randomIndex];
    const drawPosition = game.draw_order + 1;

    // 5. Create a draw_event record
    const drawEvent = {
      id: nextDrawEventId++,
      game_id: gameId,
      drawn_number: drawnNumber,
      draw_position: drawPosition,
      drawn_at: new Date()
    };

    mockDrawEvents.push(drawEvent);

    // 6. Update game's drawn_numbers array and increment draw_order
    const updatedDrawnNumbers = [...drawnNumbers, drawnNumber];
    const updatedDrawOrder = game.draw_order + 1;

    game.drawn_numbers = updatedDrawnNumbers;
    game.draw_order = updatedDrawOrder;

    // 8. If this is the 5th number, check for winners and complete game
    if (updatedDrawOrder === 5) {
      // Check for winners
      const gamePlayers = mockPlayers.filter(p => p.game_id === gameId);
      
      for (const player of gamePlayers) {
        const selectedNumbers: number[] = Array.isArray(player.selected_numbers)
          ? player.selected_numbers
          : JSON.parse(player.selected_numbers);
        const hasWon = selectedNumbers.every(num => updatedDrawnNumbers.includes(num));
        
        if (hasWon) {
          player.is_winner = true;
        }
      }

      // Complete the game
      game.status = 'completed';
      game.completed_at = new Date();
    }

    // Return the draw event
    return drawEvent;
  } catch (error) {
    console.error('Draw number failed:', error);
    throw error;
  }
}

// Helper functions for testing
export function _resetMockData() {
  mockGames.length = 0;
  mockPlayers.length = 0;
  mockDrawEvents.length = 0;
  nextGameId = 1;
  nextPlayerId = 1;
  nextDrawEventId = 1;
}

export function _createMockGame(gameData: any) {
  const game = {
    id: nextGameId++,
    ...gameData,
    created_at: new Date()
  };
  mockGames.push(game);
  return game;
}

export function _createMockPlayer(playerData: any) {
  const player = {
    id: nextPlayerId++,
    ...playerData,
    joined_at: new Date()
  };
  mockPlayers.push(player);
  return player;
}

export function _getMockGames() {
  return mockGames;
}

export function _getMockPlayers() {
  return mockPlayers;
}

export function _getMockDrawEvents() {
  return mockDrawEvents;
}
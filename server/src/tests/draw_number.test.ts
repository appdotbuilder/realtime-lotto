import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { 
  drawNumber, 
  _resetMockData, 
  _createMockGame, 
  _createMockPlayer, 
  _getMockGames,
  _getMockPlayers,
  _getMockDrawEvents
} from '../handlers/draw_number';

describe('drawNumber', () => {
  beforeEach(() => {
    createDB();
    _resetMockData();
  });
  
  afterEach(resetDB);

  it('should draw a number for a game in progress', async () => {
    // Create a game in progress
    const game = _createMockGame({
      room_code: 'TEST001',
      status: 'in_progress',
      max_players: 4,
      current_players: 2,
      drawn_numbers: [],
      draw_order: 0
    });

    // Draw a number
    const result = await drawNumber(game.id);

    // Validate the draw event
    expect(result.id).toBeDefined();
    expect(result.game_id).toEqual(game.id);
    expect(result.drawn_number).toBeGreaterThanOrEqual(1);
    expect(result.drawn_number).toBeLessThanOrEqual(50);
    expect(result.draw_position).toEqual(1);
    expect(result.drawn_at).toBeInstanceOf(Date);

    // Verify draw event was saved
    const drawEvents = _getMockDrawEvents();
    expect(drawEvents).toHaveLength(1);
    expect(drawEvents[0].drawn_number).toEqual(result.drawn_number);
    expect(drawEvents[0].draw_position).toEqual(1);

    // Verify game was updated
    const games = _getMockGames();
    const updatedGame = games.find(g => g.id === game.id);
    expect(updatedGame?.draw_order).toEqual(1);
    expect(updatedGame?.drawn_numbers).toHaveLength(1);
    expect(updatedGame?.drawn_numbers[0]).toEqual(result.drawn_number);
  });

  it('should draw sequential numbers correctly', async () => {
    // Create a game in progress
    const game = _createMockGame({
      room_code: 'TEST002',
      status: 'in_progress',
      max_players: 4,
      current_players: 2,
      drawn_numbers: [1, 15, 30],
      draw_order: 3
    });

    // Draw the 4th number
    const result = await drawNumber(game.id);

    expect(result.draw_position).toEqual(4);
    expect([1, 15, 30]).not.toContain(result.drawn_number);

    // Verify game state
    const games = _getMockGames();
    const updatedGame = games.find(g => g.id === game.id);
    expect(updatedGame?.draw_order).toEqual(4);
    expect(updatedGame?.status).toEqual('in_progress'); // Not completed yet
    expect(updatedGame?.drawn_numbers).toHaveLength(4);
    expect(updatedGame?.drawn_numbers).toContain(result.drawn_number);
  });

  it('should complete game and declare winners after 5th draw', async () => {
    // Create a game with 4 numbers already drawn
    const game = _createMockGame({
      room_code: 'TEST003',
      status: 'in_progress',
      max_players: 4,
      current_players: 2,
      drawn_numbers: [5, 10, 15, 20],
      draw_order: 4
    });

    // Add players with selected numbers
    const winnerPlayer = _createMockPlayer({
      game_id: game.id,
      player_name: 'Winner Player',
      selected_numbers: [5, 10, 15, 20, 25], // Will win if 25 is drawn
      is_winner: false
    });

    const loserPlayer = _createMockPlayer({
      game_id: game.id,
      player_name: 'Loser Player',
      selected_numbers: [1, 2, 3, 4, 6], // Won't win
      is_winner: false
    });

    const result = await drawNumber(game.id);

    expect(result.draw_position).toEqual(5);

    // Verify game was completed
    const games = _getMockGames();
    const updatedGame = games.find(g => g.id === game.id);
    expect(updatedGame?.draw_order).toEqual(5);
    expect(updatedGame?.status).toEqual('completed');
    expect(updatedGame?.completed_at).toBeInstanceOf(Date);
    expect(updatedGame?.drawn_numbers).toHaveLength(5);

    // Check if the winner was correctly identified
    const players = _getMockPlayers();
    const winner = players.find(p => p.player_name === 'Winner Player');
    const loser = players.find(p => p.player_name === 'Loser Player');

    // Winner should be marked as winner if 25 was drawn (completing their set)
    const finalDrawnNumbers = updatedGame?.drawn_numbers || [];
    if (finalDrawnNumbers.includes(25)) {
      expect(winner?.is_winner).toBe(true);
    } else {
      expect(winner?.is_winner).toBe(false);
    }
    
    expect(loser?.is_winner).toBe(false);
  });

  it('should throw error for non-existent game', async () => {
    await expect(drawNumber(999)).rejects.toThrow(/game not found/i);
  });

  it('should throw error for game not in progress', async () => {
    // Create a waiting game
    const game = _createMockGame({
      room_code: 'TEST004',
      status: 'waiting',
      max_players: 4,
      current_players: 1,
      drawn_numbers: [],
      draw_order: 0
    });

    await expect(drawNumber(game.id)).rejects.toThrow(/game is not in progress/i);
  });

  it('should throw error when all numbers already drawn', async () => {
    // Create a game with all 5 numbers drawn but still in progress (edge case)
    const game = _createMockGame({
      room_code: 'TEST005',
      status: 'in_progress', // Changed from 'completed' to test the draw_order check
      max_players: 4,
      current_players: 2,
      drawn_numbers: [1, 2, 3, 4, 5],
      draw_order: 5
    });

    await expect(drawNumber(game.id)).rejects.toThrow(/all numbers have already been drawn/i);
  });

  it('should not draw duplicate numbers', async () => {
    // Create a game with some numbers already drawn
    const game = _createMockGame({
      room_code: 'TEST006',
      status: 'in_progress',
      max_players: 4,
      current_players: 2,
      drawn_numbers: [1, 25, 50],
      draw_order: 3
    });

    // Draw the next number
    const result = await drawNumber(game.id);

    // Ensure it's not a duplicate
    expect([1, 25, 50]).not.toContain(result.drawn_number);
    expect(result.draw_position).toEqual(4);

    // Verify the number was added to the game
    const games = _getMockGames();
    const updatedGame = games.find(g => g.id === game.id);
    const drawnNumbers = updatedGame?.drawn_numbers || [];
    expect(drawnNumbers).toHaveLength(4);
    expect(new Set(drawnNumbers).size).toEqual(4); // All unique
  });

  it('should handle multiple winners correctly', async () => {
    // Create a game with 4 numbers drawn
    const game = _createMockGame({
      room_code: 'TEST007',
      status: 'in_progress',
      max_players: 6,
      current_players: 3,
      drawn_numbers: [10, 20, 30, 40],
      draw_order: 4
    });

    // Add multiple potential winners
    _createMockPlayer({
      game_id: game.id,
      player_name: 'Player 1',
      selected_numbers: [10, 20, 30, 40, 1], // Will win if 1 is drawn
      is_winner: false
    });

    _createMockPlayer({
      game_id: game.id,
      player_name: 'Player 2',
      selected_numbers: [10, 20, 30, 40, 1], // Same numbers - both can win
      is_winner: false
    });

    _createMockPlayer({
      game_id: game.id,
      player_name: 'Player 3',
      selected_numbers: [5, 6, 7, 8, 9], // Won't win
      is_winner: false
    });

    // Draw the 5th number
    const result = await drawNumber(game.id);

    expect(result.draw_position).toEqual(5);

    // Check final game state
    const games = _getMockGames();
    const updatedGame = games.find(g => g.id === game.id);
    expect(updatedGame?.status).toEqual('completed');

    // Check players
    const players = _getMockPlayers();
    const finalDrawnNumbers = updatedGame?.drawn_numbers || [];
    
    // If the drawn number completes Player 1 and 2's numbers, both should win
    const player1 = players.find(p => p.player_name === 'Player 1');
    const player2 = players.find(p => p.player_name === 'Player 2');
    const player3 = players.find(p => p.player_name === 'Player 3');

    const player1Numbers = player1?.selected_numbers || [];
    const hasPlayer1Won = player1Numbers.every((num: number) => finalDrawnNumbers.includes(num));
    
    expect(player1?.is_winner).toBe(hasPlayer1Won);
    expect(player2?.is_winner).toBe(hasPlayer1Won); // Same numbers, same result
    expect(player3?.is_winner).toBe(false); // Different numbers, won't win
  });

  it('should handle edge case with no available numbers', async () => {
    // This is a theoretical edge case - create a game where somehow all 50 numbers are drawn
    // but draw_order is less than 5 (data inconsistency)
    const allNumbers = Array.from({ length: 50 }, (_, i) => i + 1);
    
    const game = _createMockGame({
      room_code: 'TEST008',
      status: 'in_progress',
      max_players: 4,
      current_players: 2,
      drawn_numbers: allNumbers,
      draw_order: 2
    });

    await expect(drawNumber(game.id)).rejects.toThrow(/no available numbers to draw/i);
  });

  it('should handle JSON string format for drawn_numbers', async () => {
    // Create a game with drawn_numbers as JSON string (mimicking database storage)
    const game = _createMockGame({
      room_code: 'TEST009',
      status: 'in_progress',
      max_players: 4,
      current_players: 2,
      drawn_numbers: '[7, 14, 21]', // JSON string format
      draw_order: 3
    });

    const result = await drawNumber(game.id);

    expect(result.draw_position).toEqual(4);
    expect([7, 14, 21]).not.toContain(result.drawn_number);

    // Verify the game was updated correctly
    const games = _getMockGames();
    const updatedGame = games.find(g => g.id === game.id);
    expect(updatedGame?.drawn_numbers).toHaveLength(4);
    expect(updatedGame?.drawn_numbers).toContain(result.drawn_number);
  });

  it('should handle JSON string format for player selected_numbers', async () => {
    // Create a game with 4 numbers drawn
    const game = _createMockGame({
      room_code: 'TEST010',
      status: 'in_progress',
      max_players: 4,
      current_players: 1,
      drawn_numbers: [3, 7, 11, 19],
      draw_order: 4
    });

    // Add a player with selected_numbers as JSON string
    _createMockPlayer({
      game_id: game.id,
      player_name: 'String Format Player',
      selected_numbers: '[3, 7, 11, 19, 23]', // JSON string format
      is_winner: false
    });

    const result = await drawNumber(game.id);

    expect(result.draw_position).toEqual(5);

    // Check if winner detection works with JSON string format
    const players = _getMockPlayers();
    const player = players.find(p => p.player_name === 'String Format Player');
    
    const games = _getMockGames();
    const updatedGame = games.find(g => g.id === game.id);
    const finalDrawnNumbers = updatedGame?.drawn_numbers || [];
    
    if (finalDrawnNumbers.includes(23)) {
      expect(player?.is_winner).toBe(true);
    } else {
      expect(player?.is_winner).toBe(false);
    }
  });
});
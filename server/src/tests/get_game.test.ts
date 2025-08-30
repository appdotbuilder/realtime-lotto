import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { type GetGameInput, type GameStatus } from '../schema';
import { getGame } from '../handlers/get_game';

// Helper function to create tables since we can't modify schema.ts
const createTables = async () => {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      room_code VARCHAR(10) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'waiting',
      max_players INTEGER NOT NULL,
      current_players INTEGER NOT NULL DEFAULT 0,
      drawn_numbers JSONB NOT NULL DEFAULT '[]',
      draw_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      started_at TIMESTAMP,
      completed_at TIMESTAMP
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_name VARCHAR(50) NOT NULL,
      selected_numbers JSONB NOT NULL,
      is_winner BOOLEAN NOT NULL DEFAULT FALSE,
      joined_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draw_events (
      id SERIAL PRIMARY KEY,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      drawn_number INTEGER NOT NULL,
      draw_position INTEGER NOT NULL,
      drawn_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
};

// Helper function to insert test game
const insertTestGame = async (overrides: Partial<{
  room_code: string;
  status: GameStatus;
  max_players: number;
  current_players: number;
  drawn_numbers: number[];
  draw_order: number;
  started_at: Date | null;
  completed_at: Date | null;
}> = {}) => {
  const gameData = {
    room_code: 'TEST123',
    status: 'waiting' as GameStatus,
    max_players: 10,
    current_players: 0,
    drawn_numbers: [],
    draw_order: 0,
    started_at: null,
    completed_at: null,
    ...overrides
  };

  const result = await db.execute(sql`
    INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, started_at, completed_at)
    VALUES (${gameData.room_code}, ${gameData.status}, ${gameData.max_players}, ${gameData.current_players}, 
            ${JSON.stringify(gameData.drawn_numbers)}, ${gameData.draw_order}, ${gameData.started_at}, ${gameData.completed_at})
    RETURNING id, created_at
  `);

  const rows = Array.isArray(result) ? result : result.rows || [];
  return rows[0] as any;
};

// Helper function to insert test player
const insertTestPlayer = async (gameId: number, overrides: Partial<{
  player_name: string;
  selected_numbers: number[];
  is_winner: boolean;
}> = {}) => {
  const playerData = {
    player_name: 'TestPlayer',
    selected_numbers: [1, 2, 3, 4, 5],
    is_winner: false,
    ...overrides
  };

  const result = await db.execute(sql`
    INSERT INTO players (game_id, player_name, selected_numbers, is_winner)
    VALUES (${gameId}, ${playerData.player_name}, ${JSON.stringify(playerData.selected_numbers)}, ${playerData.is_winner})
    RETURNING id, joined_at
  `);

  const rows = Array.isArray(result) ? result : result.rows || [];
  return rows[0] as any;
};

// Helper function to insert test draw event
const insertTestDrawEvent = async (gameId: number, overrides: Partial<{
  drawn_number: number;
  draw_position: number;
}> = {}) => {
  const drawData = {
    drawn_number: 15,
    draw_position: 1,
    ...overrides
  };

  const result = await db.execute(sql`
    INSERT INTO draw_events (game_id, drawn_number, draw_position)
    VALUES (${gameId}, ${drawData.drawn_number}, ${drawData.draw_position})
    RETURNING id, drawn_at
  `);

  const rows = Array.isArray(result) ? result : result.rows || [];
  return rows[0] as any;
};

const testInput: GetGameInput = {
  room_code: 'TEST123'
};

describe('getGame', () => {
  beforeEach(async () => {
    await createDB();
    await createTables();
  });
  
  afterEach(resetDB);

  it('should get game with basic information', async () => {
    const gameRecord = await insertTestGame();
    
    const result = await getGame(testInput);

    // Verify game data
    expect(result.game.id).toEqual(gameRecord.id);
    expect(result.game.room_code).toEqual('TEST123');
    expect(result.game.status).toEqual('waiting');
    expect(result.game.max_players).toEqual(10);
    expect(result.game.current_players).toEqual(0);
    expect(result.game.drawn_numbers).toEqual([]);
    expect(result.game.draw_order).toEqual(0);
    expect(result.game.created_at).toBeInstanceOf(Date);
    expect(result.game.started_at).toBeNull();
    expect(result.game.completed_at).toBeNull();

    // Verify empty collections
    expect(result.players).toEqual([]);
    expect(result.latest_draw).toBeNull();
  });

  it('should get game with players', async () => {
    const gameRecord = await insertTestGame({ 
      current_players: 2,
      status: 'in_progress'
    });
    
    // Insert test players
    const player1 = await insertTestPlayer(gameRecord.id, {
      player_name: 'Alice',
      selected_numbers: [1, 12, 23, 34, 45]
    });
    
    const player2 = await insertTestPlayer(gameRecord.id, {
      player_name: 'Bob',
      selected_numbers: [2, 13, 24, 35, 46],
      is_winner: true
    });

    const result = await getGame(testInput);

    // Verify game data
    expect(result.game.status).toEqual('in_progress');
    expect(result.game.current_players).toEqual(2);

    // Verify players
    expect(result.players).toHaveLength(2);
    
    const alice = result.players.find(p => p.player_name === 'Alice');
    expect(alice).toBeDefined();
    expect(alice!.id).toEqual(player1.id);
    expect(alice!.game_id).toEqual(gameRecord.id);
    expect(alice!.selected_numbers).toEqual([1, 12, 23, 34, 45]);
    expect(alice!.is_winner).toEqual(false);
    expect(alice!.joined_at).toBeInstanceOf(Date);

    const bob = result.players.find(p => p.player_name === 'Bob');
    expect(bob).toBeDefined();
    expect(bob!.id).toEqual(player2.id);
    expect(bob!.selected_numbers).toEqual([2, 13, 24, 35, 46]);
    expect(bob!.is_winner).toEqual(true);
  });

  it('should get game with drawn numbers and latest draw event', async () => {
    const drawnNumbers = [7, 14, 21];
    const gameRecord = await insertTestGame({
      status: 'in_progress',
      drawn_numbers: drawnNumbers,
      draw_order: 3
    });

    // Insert multiple draw events
    await insertTestDrawEvent(gameRecord.id, {
      drawn_number: 7,
      draw_position: 1
    });
    
    await insertTestDrawEvent(gameRecord.id, {
      drawn_number: 14,
      draw_position: 2
    });
    
    // Latest draw event
    const latestDraw = await insertTestDrawEvent(gameRecord.id, {
      drawn_number: 21,
      draw_position: 3
    });

    const result = await getGame(testInput);

    // Verify game with drawn numbers
    expect(result.game.drawn_numbers).toEqual([7, 14, 21]);
    expect(result.game.draw_order).toEqual(3);

    // Verify latest draw event
    expect(result.latest_draw).toBeDefined();
    expect(result.latest_draw!.id).toEqual(latestDraw.id);
    expect(result.latest_draw!.game_id).toEqual(gameRecord.id);
    expect(result.latest_draw!.drawn_number).toEqual(21);
    expect(result.latest_draw!.draw_position).toEqual(3);
    expect(result.latest_draw!.drawn_at).toBeInstanceOf(Date);
  });

  it('should get completed game with winners', async () => {
    const completedAt = new Date();
    const startedAt = new Date(Date.now() - 60000); // 1 minute ago
    
    const gameRecord = await insertTestGame({
      status: 'completed',
      current_players: 3,
      drawn_numbers: [5, 10, 15, 20, 25],
      draw_order: 5,
      started_at: startedAt,
      completed_at: completedAt
    });

    // Add players with some winners
    await insertTestPlayer(gameRecord.id, {
      player_name: 'Winner1',
      selected_numbers: [5, 10, 15, 20, 25],
      is_winner: true
    });
    
    await insertTestPlayer(gameRecord.id, {
      player_name: 'Winner2',
      selected_numbers: [5, 10, 15, 20, 30],
      is_winner: true
    });
    
    await insertTestPlayer(gameRecord.id, {
      player_name: 'Loser',
      selected_numbers: [1, 2, 3, 4, 6],
      is_winner: false
    });

    const result = await getGame(testInput);

    // Verify completed game
    expect(result.game.status).toEqual('completed');
    expect(result.game.drawn_numbers).toEqual([5, 10, 15, 20, 25]);
    expect(result.game.draw_order).toEqual(5);
    expect(result.game.started_at).toBeInstanceOf(Date);
    expect(result.game.completed_at).toBeInstanceOf(Date);

    // Verify players with winners
    expect(result.players).toHaveLength(3);
    const winners = result.players.filter(p => p.is_winner);
    expect(winners).toHaveLength(2);
    expect(winners.map(w => w.player_name)).toContain('Winner1');
    expect(winners.map(w => w.player_name)).toContain('Winner2');
  });

  it('should throw error when game not found', async () => {
    const nonExistentInput: GetGameInput = {
      room_code: 'NOTFOUND'
    };

    await expect(getGame(nonExistentInput)).rejects.toThrow(/Game with room code NOTFOUND not found/i);
  });

  it('should handle game with empty drawn_numbers as array', async () => {
    await insertTestGame({
      room_code: 'EMPTY123'
    });

    const result = await getGame({
      room_code: 'EMPTY123'
    });

    expect(result.game.drawn_numbers).toEqual([]);
    expect(Array.isArray(result.game.drawn_numbers)).toBe(true);
  });

  it('should handle player with selected numbers correctly', async () => {
    const gameRecord = await insertTestGame();
    await insertTestPlayer(gameRecord.id, {
      player_name: 'NumberPlayer',
      selected_numbers: [3, 7, 13, 27, 42]
    });

    const result = await getGame(testInput);

    expect(result.players).toHaveLength(1);
    expect(result.players[0].selected_numbers).toEqual([3, 7, 13, 27, 42]);
    expect(Array.isArray(result.players[0].selected_numbers)).toBe(true);
  });

  it('should return latest draw event when multiple exist', async () => {
    const gameRecord = await insertTestGame();

    // Insert events in order (older first)
    await insertTestDrawEvent(gameRecord.id, {
      drawn_number: 1,
      draw_position: 1
    });

    // Wait a small amount to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    await insertTestDrawEvent(gameRecord.id, {
      drawn_number: 2,
      draw_position: 2
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    // This should be the latest
    const latestDraw = await insertTestDrawEvent(gameRecord.id, {
      drawn_number: 3,
      draw_position: 3
    });

    const result = await getGame(testInput);

    expect(result.latest_draw).toBeDefined();
    expect(result.latest_draw!.drawn_number).toEqual(3);
    expect(result.latest_draw!.draw_position).toEqual(3);
    expect(result.latest_draw!.id).toEqual(latestDraw.id);
  });
});
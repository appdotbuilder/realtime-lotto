import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { getGameHistory } from '../handlers/get_game_history';

describe('getGameHistory', () => {
  beforeEach(async () => {
    await createDB();
    
    // Create the games table since schema is empty
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        room_code VARCHAR(10) UNIQUE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'waiting',
        max_players INTEGER NOT NULL DEFAULT 10,
        current_players INTEGER NOT NULL DEFAULT 0,
        drawn_numbers JSONB NOT NULL DEFAULT '[]',
        draw_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `);
  });
  
  afterEach(resetDB);

  // Helper function to insert test games
  const insertGame = async (gameData: any) => {
    await db.execute(sql`
      INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at, started_at, completed_at)
      VALUES (
        ${gameData.room_code}, 
        ${gameData.status}, 
        ${gameData.max_players}, 
        ${gameData.current_players}, 
        ${JSON.stringify(gameData.drawn_numbers)}, 
        ${gameData.draw_order},
        ${gameData.created_at || new Date().toISOString()},
        ${gameData.started_at || null},
        ${gameData.completed_at || null}
      )
    `);
  };

  it('should return empty array when no completed games exist', async () => {
    const result = await getGameHistory();
    
    expect(result).toEqual([]);
  });

  it('should return only completed games', async () => {
    // Create test games with different statuses
    await insertGame({
      room_code: 'GAME001',
      status: 'completed',
      max_players: 10,
      current_players: 5,
      drawn_numbers: [1, 2, 3, 4, 5],
      draw_order: 5,
      completed_at: '2024-01-01T10:00:00Z'
    });

    await insertGame({
      room_code: 'GAME002',
      status: 'in_progress',
      max_players: 8,
      current_players: 3,
      drawn_numbers: [10, 20],
      draw_order: 2
    });

    await insertGame({
      room_code: 'GAME003',
      status: 'waiting',
      max_players: 12,
      current_players: 1,
      drawn_numbers: [],
      draw_order: 0
    });

    await insertGame({
      room_code: 'GAME004',
      status: 'completed',
      max_players: 6,
      current_players: 4,
      drawn_numbers: [15, 25, 35, 45, 50],
      draw_order: 5,
      completed_at: '2024-01-02T15:30:00Z'
    });

    const result = await getGameHistory();

    // Should only return completed games
    expect(result).toHaveLength(2);
    expect(result.every(game => game.status === 'completed')).toBe(true);
    
    // Verify specific game data
    const roomCodes = result.map(game => game.room_code);
    expect(roomCodes).toContain('GAME001');
    expect(roomCodes).toContain('GAME004');
    expect(roomCodes).not.toContain('GAME002');
    expect(roomCodes).not.toContain('GAME003');
  });

  it('should return games ordered by completed_at descending', async () => {
    // Create games with different completion times
    await insertGame({
      room_code: 'EARLY',
      status: 'completed',
      max_players: 10,
      current_players: 5,
      drawn_numbers: [1, 2, 3, 4, 5],
      draw_order: 5,
      completed_at: '2024-01-01T10:00:00Z'
    });

    await insertGame({
      room_code: 'LATE',
      status: 'completed',
      max_players: 10,
      current_players: 8,
      drawn_numbers: [10, 20, 30, 40, 50],
      draw_order: 5,
      completed_at: '2024-01-03T20:00:00Z'
    });

    await insertGame({
      room_code: 'MIDDLE',
      status: 'completed',
      max_players: 10,
      current_players: 6,
      drawn_numbers: [5, 15, 25, 35, 45],
      draw_order: 5,
      completed_at: '2024-01-02T15:00:00Z'
    });

    const result = await getGameHistory();

    expect(result).toHaveLength(3);
    
    // Should be ordered by completed_at descending (most recent first)
    expect(result[0].room_code).toBe('LATE');
    expect(result[1].room_code).toBe('MIDDLE');
    expect(result[2].room_code).toBe('EARLY');
    
    // Verify completion times are in descending order
    expect(result[0].completed_at!.getTime()).toBeGreaterThan(result[1].completed_at!.getTime());
    expect(result[1].completed_at!.getTime()).toBeGreaterThan(result[2].completed_at!.getTime());
  });

  it('should return correct game data structure', async () => {
    await insertGame({
      room_code: 'TEST123',
      status: 'completed',
      max_players: 15,
      current_players: 12,
      drawn_numbers: [7, 14, 21, 28, 35],
      draw_order: 5,
      completed_at: '2024-01-01T12:00:00Z',
      started_at: '2024-01-01T11:30:00Z'
    });

    const result = await getGameHistory();

    expect(result).toHaveLength(1);
    
    const game = result[0];
    expect(game.id).toBeDefined();
    expect(game.room_code).toBe('TEST123');
    expect(game.status).toBe('completed');
    expect(game.max_players).toBe(15);
    expect(game.current_players).toBe(12);
    expect(game.drawn_numbers).toEqual([7, 14, 21, 28, 35]);
    expect(game.draw_order).toBe(5);
    expect(game.created_at).toBeInstanceOf(Date);
    expect(game.started_at).toBeInstanceOf(Date);
    expect(game.completed_at).toBeInstanceOf(Date);
    expect(game.completed_at!.toISOString()).toBe('2024-01-01T12:00:00.000Z');
  });

  it('should handle games with null started_at dates', async () => {
    await insertGame({
      room_code: 'NULLSTART',
      status: 'completed',
      max_players: 10,
      current_players: 5,
      drawn_numbers: [1, 2, 3, 4, 5],
      draw_order: 5,
      completed_at: '2024-01-01T10:00:00Z',
      started_at: null
    });

    const result = await getGameHistory();

    expect(result).toHaveLength(1);
    expect(result[0].started_at).toBeNull();
    expect(result[0].completed_at).toBeInstanceOf(Date);
  });

  it('should limit results for performance', async () => {
    // Create more than 100 completed games
    const games = Array.from({ length: 105 }, (_, i) => ({
      room_code: `GAME${i.toString().padStart(3, '0')}`,
      status: 'completed',
      max_players: 10,
      current_players: Math.floor(Math.random() * 10) + 1,
      drawn_numbers: [1, 2, 3, 4, 5],
      draw_order: 5,
      completed_at: new Date(Date.now() - i * 1000).toISOString() // Different completion times
    }));

    for (const game of games) {
      await insertGame(game);
    }

    const result = await getGameHistory();

    // Should be limited to 100 results
    expect(result).toHaveLength(100);
    
    // Should still be ordered by completed_at descending
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].completed_at!.getTime()).toBeGreaterThanOrEqual(
        result[i + 1].completed_at!.getTime()
      );
    }
  });

  it('should handle empty drawn_numbers array correctly', async () => {
    await insertGame({
      room_code: 'EMPTY',
      status: 'completed',
      max_players: 10,
      current_players: 5,
      drawn_numbers: null, // Test null case
      draw_order: 0,
      completed_at: '2024-01-01T10:00:00Z'
    });

    const result = await getGameHistory();

    expect(result).toHaveLength(1);
    expect(result[0].drawn_numbers).toEqual([]);
    expect(result[0].draw_order).toBe(0);
  });
});
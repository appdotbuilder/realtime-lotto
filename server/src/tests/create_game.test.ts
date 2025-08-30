import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { type CreateGameInput } from '../schema';
import { createGame } from '../handlers/create_game';
import { sql } from 'drizzle-orm';

// Test inputs with all required fields
const validInput: CreateGameInput = {
  room_code: 'TEST123',
  max_players: 10 // Using explicit value even though it has a default
};

const minimalInput: CreateGameInput = {
  room_code: 'GAME456',
  max_players: 2 // Testing minimum allowed value
};

const maxPlayersInput: CreateGameInput = {
  room_code: 'BIG999',
  max_players: 50 // Testing maximum allowed value
};

// Helper function to create games table for testing
const createGamesTable = async () => {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      room_code VARCHAR(10) UNIQUE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'waiting',
      max_players INTEGER NOT NULL DEFAULT 10,
      current_players INTEGER NOT NULL DEFAULT 0,
      drawn_numbers JSONB NOT NULL DEFAULT '[]',
      draw_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      started_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE
    )
  `);
};

describe('createGame', () => {
  beforeEach(async () => {
    await createDB();
    await createGamesTable();
  });
  
  afterEach(resetDB);

  it('should create a game with valid input', async () => {
    const result = await createGame(validInput);

    // Verify all required fields are present and correct
    expect(result.room_code).toEqual('TEST123');
    expect(result.status).toEqual('waiting');
    expect(result.max_players).toEqual(10);
    expect(result.current_players).toEqual(0);
    expect(result.drawn_numbers).toEqual([]);
    expect(result.draw_order).toEqual(0);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.started_at).toBeNull();
    expect(result.completed_at).toBeNull();
  });

  it('should save game to database correctly', async () => {
    const result = await createGame(validInput);

    // Query database to verify the game was saved
    const gameResult = await db.execute(sql`
      SELECT * FROM games WHERE id = ${result.id}
    `);

    expect(gameResult.rows).toHaveLength(1);
    const game = gameResult.rows[0] as any;
    
    expect(game.room_code).toEqual('TEST123');
    expect(game.status).toEqual('waiting');
    expect(game.max_players).toEqual(10);
    expect(game.current_players).toEqual(0);
    expect(game.draw_order).toEqual(0);
    expect(new Date(game.created_at)).toBeInstanceOf(Date);
  });

  it('should handle minimum max_players value', async () => {
    const result = await createGame(minimalInput);

    expect(result.room_code).toEqual('GAME456');
    expect(result.max_players).toEqual(2);
    expect(result.status).toEqual('waiting');
  });

  it('should handle maximum max_players value', async () => {
    const result = await createGame(maxPlayersInput);

    expect(result.room_code).toEqual('BIG999');
    expect(result.max_players).toEqual(50);
    expect(result.status).toEqual('waiting');
  });

  it('should reject duplicate room codes', async () => {
    // Create first game
    await createGame(validInput);

    // Attempt to create game with same room code
    const duplicateInput: CreateGameInput = {
      room_code: 'TEST123', // Same room code
      max_players: 15
    };

    await expect(createGame(duplicateInput)).rejects.toThrow(/room code.*already exists/i);
  });

  it('should allow different room codes', async () => {
    // Create multiple games with different room codes
    const game1 = await createGame(validInput);
    const game2 = await createGame(minimalInput);
    const game3 = await createGame(maxPlayersInput);

    // Verify all games were created successfully
    expect(game1.room_code).toEqual('TEST123');
    expect(game2.room_code).toEqual('GAME456');
    expect(game3.room_code).toEqual('BIG999');

    // Verify they have different IDs
    expect(game1.id).not.toEqual(game2.id);
    expect(game2.id).not.toEqual(game3.id);
    expect(game1.id).not.toEqual(game3.id);
  });

  it('should initialize game with correct default values', async () => {
    const result = await createGame(validInput);

    // Verify all default values are set correctly
    expect(result.status).toEqual('waiting');
    expect(result.current_players).toEqual(0);
    expect(result.drawn_numbers).toEqual([]);
    expect(result.draw_order).toEqual(0);
    expect(result.started_at).toBeNull();
    expect(result.completed_at).toBeNull();
  });

  it('should verify database constraint on unique room_code', async () => {
    // Create first game
    await createGame({
      room_code: 'UNIQUE1',
      max_players: 5
    });

    // Try to create another game with same room code
    // This should fail at the application level since we check for duplicates
    await expect(createGame({
      room_code: 'UNIQUE1',
      max_players: 8
    })).rejects.toThrow(/room code.*already exists/i);
  });

  it('should handle JSON conversion for drawn_numbers correctly', async () => {
    const result = await createGame(validInput);

    // Verify drawn_numbers is an empty array, not a string
    expect(Array.isArray(result.drawn_numbers)).toBe(true);
    expect(result.drawn_numbers).toEqual([]);
    
    // Verify the database stores it as JSON
    const gameResult = await db.execute(sql`
      SELECT drawn_numbers FROM games WHERE id = ${result.id}
    `);
    
    const dbGame = gameResult.rows[0] as any;
    // Handle both array and string formats for JSON data
    const drawnNumbers = Array.isArray(dbGame.drawn_numbers) 
      ? dbGame.drawn_numbers 
      : JSON.parse(dbGame.drawn_numbers || '[]');
    expect(drawnNumbers).toEqual([]);
  });
});
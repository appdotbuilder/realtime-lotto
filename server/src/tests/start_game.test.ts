import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { type StartGameInput } from '../schema';
import { startGame } from '../handlers/start_game';

const testInput: StartGameInput = {
  room_code: 'TEST123'
};

// Helper to create tables since schema is empty
const createTables = async () => {
  await db.execute(sql`
    CREATE TABLE games (
      id SERIAL PRIMARY KEY,
      room_code VARCHAR(10) UNIQUE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'waiting',
      max_players INTEGER NOT NULL DEFAULT 10,
      current_players INTEGER NOT NULL DEFAULT 0,
      drawn_numbers JSON NOT NULL DEFAULT '[]',
      draw_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      started_at TIMESTAMP,
      completed_at TIMESTAMP
    )
  `);

  await db.execute(sql`
    CREATE TABLE players (
      id SERIAL PRIMARY KEY,
      game_id INTEGER REFERENCES games(id) NOT NULL,
      player_name VARCHAR(50) NOT NULL,
      selected_numbers JSON NOT NULL,
      is_winner BOOLEAN NOT NULL DEFAULT false,
      joined_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE draw_events (
      id SERIAL PRIMARY KEY,
      game_id INTEGER REFERENCES games(id) NOT NULL,
      drawn_number INTEGER NOT NULL,
      draw_position INTEGER NOT NULL,
      drawn_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
};

describe('startGame', () => {
  beforeEach(async () => {
    await resetDB();
    await createTables();
  });
  afterEach(resetDB);

  it('should start a game successfully', async () => {
    // Create a test game first
    const gameResult = await db.execute(
      sql`INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at)
          VALUES ('TEST123', 'waiting', 10, 0, '[]'::json, 0, NOW())
          RETURNING id`
    );

    const gameId = gameResult.rows[0]['id'];

    // Add two test players
    await db.execute(
      sql`INSERT INTO players (game_id, player_name, selected_numbers, is_winner, joined_at)
          VALUES 
            (${gameId}, 'Player 1', '[1,2,3,4,5]'::json, false, NOW()),
            (${gameId}, 'Player 2', '[6,7,8,9,10]'::json, false, NOW())`
    );

    const result = await startGame(testInput);

    // Validate the result
    expect(result.room_code).toEqual('TEST123');
    expect(result.status).toEqual('in_progress');
    expect(result.current_players).toEqual(2);
    expect(result.started_at).toBeInstanceOf(Date);
    expect(result.drawn_numbers).toEqual([]);
    expect(result.draw_order).toEqual(0);
    expect(result.completed_at).toBeNull();
  });

  it('should save game status to database', async () => {
    // Create a test game
    const gameResult = await db.execute(
      sql`INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at)
          VALUES ('TEST123', 'waiting', 10, 0, '[]'::json, 0, NOW())
          RETURNING id`
    );

    const gameId = gameResult.rows[0]['id'];

    // Add two test players
    await db.execute(
      sql`INSERT INTO players (game_id, player_name, selected_numbers, is_winner, joined_at)
          VALUES 
            (${gameId}, 'Player 1', '[1,2,3,4,5]'::json, false, NOW()),
            (${gameId}, 'Player 2', '[11,12,13,14,15]'::json, false, NOW())`
    );

    await startGame(testInput);

    // Verify the database was updated
    const games = await db.execute(
      sql`SELECT * FROM games WHERE room_code = 'TEST123'`
    );

    expect(games.rows).toHaveLength(1);
    const game = games.rows[0] as any;
    expect(game.status).toEqual('in_progress');
    expect(game.started_at).toBeTruthy();
    expect(game.current_players).toEqual(2);
    
    // Handle JSON parsing safely
    let drawnNumbers = [];
    if (game.drawn_numbers) {
      drawnNumbers = typeof game.drawn_numbers === 'string' 
        ? JSON.parse(game.drawn_numbers) 
        : game.drawn_numbers;
    }
    expect(drawnNumbers).toEqual([]);
  });

  it('should throw error when game not found', async () => {
    await expect(startGame({ room_code: 'NOTFOUND' }))
      .rejects.toThrow(/Game not found/i);
  });

  it('should throw error when game already started', async () => {
    // Create a game that's already in progress
    await db.execute(
      sql`INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at, started_at)
          VALUES ('TEST123', 'in_progress', 10, 2, '[]'::json, 0, NOW(), NOW())`
    );

    await expect(startGame(testInput))
      .rejects.toThrow(/Game has already started or is completed/i);
  });

  it('should throw error when not enough players', async () => {
    // Create a game with only one player
    const gameResult = await db.execute(
      sql`INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at)
          VALUES ('TEST123', 'waiting', 10, 0, '[]'::json, 0, NOW())
          RETURNING id`
    );

    const gameId = gameResult.rows[0]['id'];

    // Add only one player
    await db.execute(
      sql`INSERT INTO players (game_id, player_name, selected_numbers, is_winner, joined_at)
          VALUES (${gameId}, 'Lonely Player', '[1,2,3,4,5]'::json, false, NOW())`
    );

    await expect(startGame(testInput))
      .rejects.toThrow(/Need at least 2 players to start the game/i);
  });

  it('should update current_players count correctly', async () => {
    // Create a test game
    const gameResult = await db.execute(
      sql`INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at)
          VALUES ('TEST123', 'waiting', 10, 0, '[]'::json, 0, NOW())
          RETURNING id`
    );

    const gameId = gameResult.rows[0]['id'];

    // Add three test players
    await db.execute(
      sql`INSERT INTO players (game_id, player_name, selected_numbers, is_winner, joined_at)
          VALUES 
            (${gameId}, 'Player 1', '[1,2,3,4,5]'::json, false, NOW()),
            (${gameId}, 'Player 2', '[6,7,8,9,10]'::json, false, NOW()),
            (${gameId}, 'Player 3', '[11,12,13,14,15]'::json, false, NOW())`
    );

    const result = await startGame(testInput);

    // Should correctly count and update the current_players
    expect(result.current_players).toEqual(3);

    // Verify in database too
    const games = await db.execute(
      sql`SELECT * FROM games WHERE room_code = 'TEST123'`
    );

    const game = games.rows[0] as any;
    expect(game.current_players).toEqual(3);
  });
});
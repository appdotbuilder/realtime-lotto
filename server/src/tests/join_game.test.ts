import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { type JoinGameInput } from '../schema';
import { joinGame } from '../handlers/join_game';
import { sql } from 'drizzle-orm';

// Test input with valid player selection
const testInput: JoinGameInput = {
  room_code: 'TEST123',
  player_name: 'TestPlayer',
  selected_numbers: [1, 15, 23, 37, 45]
};

// Helper function to create the necessary tables
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
      is_winner BOOLEAN NOT NULL DEFAULT false,
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

describe('joinGame', () => {
  beforeEach(async () => {
    await createDB();
    await createTables();
  });
  afterEach(resetDB);

  it('should allow a player to join a waiting game', async () => {
    // Create a test game first using raw SQL
    const createGameQuery = sql`
      INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at)
      VALUES ('TEST123', 'waiting', 10, 0, '[]'::jsonb, 0, NOW())
      RETURNING *
    `;
    const gameResult = await db.execute(createGameQuery);
    const game = gameResult.rows[0] as any;

    const result = await joinGame(testInput);

    // Validate player object
    expect(result.game_id).toEqual(parseInt(game.id));
    expect(result.player_name).toEqual('TestPlayer');
    expect(result.selected_numbers).toEqual([1, 15, 23, 37, 45]);
    expect(result.is_winner).toBe(false);
    expect(result.id).toBeDefined();
    expect(result.joined_at).toBeInstanceOf(Date);
  });

  it('should save player to database and update game count', async () => {
    // Create a test game first
    const createGameQuery = sql`
      INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at)
      VALUES ('TEST123', 'waiting', 10, 2, '[]'::jsonb, 0, NOW())
      RETURNING *
    `;
    const gameResult = await db.execute(createGameQuery);
    const game = gameResult.rows[0] as any;

    const result = await joinGame(testInput);

    // Check player was saved to database
    const playerQuery = sql`
      SELECT * FROM players WHERE id = ${result.id}
    `;
    const players = await db.execute(playerQuery);

    expect(players.rows).toHaveLength(1);
    const player = players.rows[0] as any;
    expect(player.player_name).toEqual('TestPlayer');
    expect(parseInt(player.game_id)).toEqual(parseInt(game.id));
    const selectedNumbers = typeof player.selected_numbers === 'string' 
      ? JSON.parse(player.selected_numbers) 
      : player.selected_numbers;
    expect(selectedNumbers).toEqual([1, 15, 23, 37, 45]);

    // Check game's current_players count was updated
    const gameQuery = sql`
      SELECT * FROM games WHERE id = ${game.id}
    `;
    const updatedGames = await db.execute(gameQuery);
    const updatedGame = updatedGames.rows[0] as any;
    
    expect(parseInt(updatedGame.current_players)).toEqual(3);
  });

  it('should reject joining non-existent game', async () => {
    await expect(joinGame(testInput)).rejects.toThrow(/game not found/i);
  });

  it('should reject joining game that is not in waiting status', async () => {
    // Create a game in 'in_progress' status
    const createGameQuery = sql`
      INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at)
      VALUES ('TEST123', 'in_progress', 10, 3, '[5, 12]'::jsonb, 2, NOW())
    `;
    await db.execute(createGameQuery);

    await expect(joinGame(testInput)).rejects.toThrow(/not accepting new players/i);
  });

  it('should reject joining full game', async () => {
    // Create a full game
    const createGameQuery = sql`
      INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at)
      VALUES ('TEST123', 'waiting', 2, 2, '[]'::jsonb, 0, NOW())
    `;
    await db.execute(createGameQuery);

    await expect(joinGame(testInput)).rejects.toThrow(/game is full/i);
  });

  it('should handle multiple players joining the same game', async () => {
    // Create a test game
    const createGameQuery = sql`
      INSERT INTO games (room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at)
      VALUES ('MULTI123', 'waiting', 5, 0, '[]'::jsonb, 0, NOW())
      RETURNING *
    `;
    const gameResult = await db.execute(createGameQuery);
    const game = gameResult.rows[0] as any;

    // First player joins
    const player1Input: JoinGameInput = {
      room_code: 'MULTI123',
      player_name: 'Player1',
      selected_numbers: [1, 2, 3, 4, 5]
    };

    const player1 = await joinGame(player1Input);

    // Second player joins
    const player2Input: JoinGameInput = {
      room_code: 'MULTI123',
      player_name: 'Player2',
      selected_numbers: [10, 20, 30, 40, 50]
    };

    const player2 = await joinGame(player2Input);

    // Verify both players are in database
    const playersQuery = sql`
      SELECT * FROM players WHERE game_id = ${game.id}
    `;
    const playersResult = await db.execute(playersQuery);
    const players = playersResult.rows as any[];

    expect(players).toHaveLength(2);
    expect(players.map(p => p.player_name)).toContain('Player1');
    expect(players.map(p => p.player_name)).toContain('Player2');

    // Verify game count was updated correctly
    const gameQuery = sql`
      SELECT * FROM games WHERE id = ${game.id}
    `;
    const updatedGameResult = await db.execute(gameQuery);
    const updatedGame = updatedGameResult.rows[0] as any;

    expect(parseInt(updatedGame.current_players)).toEqual(2);
  });
});
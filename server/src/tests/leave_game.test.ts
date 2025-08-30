import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { sql } from 'drizzle-orm';

import { leaveGame } from '../handlers/leave_game';

describe('leaveGame', () => {
  beforeEach(async () => {
    await createDB();
    // Create the necessary tables since schema is empty
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        room_code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed')),
        max_players INTEGER NOT NULL,
        current_players INTEGER NOT NULL DEFAULT 0,
        drawn_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
        draw_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE NOT NULL,
        player_name TEXT NOT NULL,
        selected_numbers JSONB NOT NULL,
        is_winner BOOLEAN NOT NULL DEFAULT false,
        joined_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS draw_events (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE NOT NULL,
        drawn_number INTEGER NOT NULL,
        draw_position INTEGER NOT NULL,
        drawn_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
  });
  afterEach(resetDB);

  let gameId: number;
  let playerId: number;
  let secondPlayerId: number;

  // Helper to create a game with players
  const setupGameWithPlayers = async () => {
    // Create a game
    const gameResult = await db.execute(sql`
      INSERT INTO games (room_code, max_players, current_players, status, created_at)
      VALUES ('TEST123', 10, 2, 'waiting', NOW())
      RETURNING id
    `);
    
    gameId = (gameResult.rows[0] as { id: number }).id;

    // Add first player
    const player1Result = await db.execute(sql`
      INSERT INTO players (game_id, player_name, selected_numbers, is_winner, joined_at)
      VALUES (${gameId}, 'Player 1', '[1,2,3,4,5]'::jsonb, false, NOW())
      RETURNING id
    `);
    
    playerId = (player1Result.rows[0] as { id: number }).id;

    // Add second player
    const player2Result = await db.execute(sql`
      INSERT INTO players (game_id, player_name, selected_numbers, is_winner, joined_at)
      VALUES (${gameId}, 'Player 2', '[6,7,8,9,10]'::jsonb, false, NOW())
      RETURNING id
    `);
    
    secondPlayerId = (player2Result.rows[0] as { id: number }).id;
  };

  it('should successfully remove a player from a waiting game', async () => {
    await setupGameWithPlayers();

    const result = await leaveGame(gameId, playerId);

    // Should return success
    expect(result).toBe(true);

    // Player should be removed from database
    const remainingPlayersResult = await db.execute(sql`
      SELECT id FROM players WHERE id = ${playerId}
    `);

    expect(remainingPlayersResult.rows).toHaveLength(0);

    // Game's current_players count should be decremented
    const gamesResult = await db.execute(sql`
      SELECT id, current_players FROM games WHERE id = ${gameId}
    `);

    expect(gamesResult.rows).toHaveLength(1);
    expect((gamesResult.rows[0] as { current_players: number }).current_players).toBe(1);
  });

  it('should keep other players in the game', async () => {
    await setupGameWithPlayers();

    await leaveGame(gameId, playerId);

    // Second player should still be in the game
    const remainingPlayersResult = await db.execute(sql`
      SELECT id, player_name FROM players WHERE id = ${secondPlayerId}
    `);

    expect(remainingPlayersResult.rows).toHaveLength(1);
    expect((remainingPlayersResult.rows[0] as { player_name: string }).player_name).toBe('Player 2');
  });

  it('should delete the game when last player leaves', async () => {
    // Create a game with only one player
    const gameResult = await db.execute(sql`
      INSERT INTO games (room_code, max_players, current_players, status, created_at)
      VALUES ('SINGLE', 10, 1, 'waiting', NOW())
      RETURNING id
    `);
    
    const singleGameId = (gameResult.rows[0] as { id: number }).id;

    const playerResult = await db.execute(sql`
      INSERT INTO players (game_id, player_name, selected_numbers, is_winner, joined_at)
      VALUES (${singleGameId}, 'Solo Player', '[1,2,3,4,5]'::jsonb, false, NOW())
      RETURNING id
    `);
    
    const soloPlayerId = (playerResult.rows[0] as { id: number }).id;

    const result = await leaveGame(singleGameId, soloPlayerId);

    expect(result).toBe(true);

    // Game should be deleted
    const gamesResult = await db.execute(sql`
      SELECT id FROM games WHERE id = ${singleGameId}
    `);

    expect(gamesResult.rows).toHaveLength(0);

    // Player should also be gone (due to cascade delete or explicit deletion)
    const playersResult = await db.execute(sql`
      SELECT id FROM players WHERE id = ${soloPlayerId}
    `);

    expect(playersResult.rows).toHaveLength(0);
  });

  it('should throw error if player not found', async () => {
    await setupGameWithPlayers();

    expect(leaveGame(gameId, 99999)).rejects.toThrow(/player not found/i);
  });

  it('should throw error if player belongs to different game', async () => {
    await setupGameWithPlayers();

    // Create another game
    const anotherGameResult = await db.execute(sql`
      INSERT INTO games (room_code, max_players, current_players, status, created_at)
      VALUES ('OTHER123', 10, 0, 'waiting', NOW())
      RETURNING id
    `);

    const anotherGameId = (anotherGameResult.rows[0] as { id: number }).id;

    expect(leaveGame(anotherGameId, playerId)).rejects.toThrow(/player not found/i);
  });

  it('should throw error if game not found', async () => {
    await setupGameWithPlayers();

    expect(leaveGame(99999, playerId)).rejects.toThrow(/game not found/i);
  });

  it('should throw error if game is not in waiting status', async () => {
    await setupGameWithPlayers();

    // Update game status to in_progress
    await db.execute(sql`
      UPDATE games 
      SET status = 'in_progress'
      WHERE id = ${gameId}
    `);

    expect(leaveGame(gameId, playerId)).rejects.toThrow(/cannot leave game that is not in waiting status/i);
  });

  it('should throw error if game is completed', async () => {
    await setupGameWithPlayers();

    // Update game status to completed
    await db.execute(sql`
      UPDATE games 
      SET status = 'completed'
      WHERE id = ${gameId}
    `);

    expect(leaveGame(gameId, playerId)).rejects.toThrow(/cannot leave game that is not in waiting status/i);
  });

  it('should handle minimum current_players count of 0', async () => {
    // Create a game with current_players already at 0 (edge case)
    const gameResult = await db.execute(sql`
      INSERT INTO games (room_code, max_players, current_players, status, created_at)
      VALUES ('EDGE123', 10, 0, 'waiting', NOW())
      RETURNING id
    `);
    
    const edgeGameId = (gameResult.rows[0] as { id: number }).id;

    // Add a player (this would normally increment current_players but we'll test the edge case)
    const playerResult = await db.execute(sql`
      INSERT INTO players (game_id, player_name, selected_numbers, is_winner, joined_at)
      VALUES (${edgeGameId}, 'Edge Player', '[1,2,3,4,5]'::jsonb, false, NOW())
      RETURNING id
    `);
    
    const edgePlayerId = (playerResult.rows[0] as { id: number }).id;

    const result = await leaveGame(edgeGameId, edgePlayerId);

    expect(result).toBe(true);

    // Since current_players was 0 and we decremented, Math.max should keep it at 0
    // and the game should be deleted since no players remain
    const gamesResult = await db.execute(sql`
      SELECT id FROM games WHERE id = ${edgeGameId}
    `);

    expect(gamesResult.rows).toHaveLength(0);
  });

  it('should work with proper function parameters', async () => {
    await setupGameWithPlayers();

    // Verify the parameters have the correct types
    expect(typeof gameId).toBe('number');
    expect(typeof playerId).toBe('number');

    const result = await leaveGame(gameId, playerId);
    expect(result).toBe(true);
  });
});
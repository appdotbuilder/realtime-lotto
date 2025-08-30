import { db } from '../db';
import { type CreateGameInput, type Game } from '../schema';
import { sql, eq } from 'drizzle-orm';

export const createGame = async (input: CreateGameInput): Promise<Game> => {
  try {
    // Check if room code already exists using raw SQL
    const existingGameResult = await db.execute(sql`
      SELECT id FROM games WHERE room_code = ${input.room_code}
    `);

    if (existingGameResult.rows.length > 0) {
      throw new Error(`Room code ${input.room_code} already exists`);
    }

    // Insert new game record using raw SQL since schema is not available
    const result = await db.execute(sql`
      INSERT INTO games (
        room_code, 
        status, 
        max_players, 
        current_players, 
        drawn_numbers, 
        draw_order,
        created_at
      ) VALUES (
        ${input.room_code},
        'waiting',
        ${input.max_players},
        0,
        '[]'::jsonb,
        0,
        NOW()
      )
      RETURNING 
        id,
        room_code,
        status,
        max_players,
        current_players,
        drawn_numbers,
        draw_order,
        created_at,
        started_at,
        completed_at
    `);

    const game = result.rows[0] as any;
    
    // Convert and return properly typed game object
    return {
      id: game.id,
      room_code: game.room_code,
      status: game.status,
      max_players: game.max_players,
      current_players: game.current_players,
      drawn_numbers: Array.isArray(game.drawn_numbers) ? game.drawn_numbers : JSON.parse(game.drawn_numbers || '[]'), // Handle both JSON string and array
      draw_order: game.draw_order,
      created_at: new Date(game.created_at),
      started_at: game.started_at ? new Date(game.started_at) : null,
      completed_at: game.completed_at ? new Date(game.completed_at) : null
    };
  } catch (error) {
    console.error('Game creation failed:', error);
    throw error;
  }
};
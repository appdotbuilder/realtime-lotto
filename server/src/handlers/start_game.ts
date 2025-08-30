import { db } from '../db';
import { sql } from 'drizzle-orm';
import { type StartGameInput, type Game } from '../schema';

export async function startGame(input: StartGameInput): Promise<Game> {
  try {
    // 1. Find the game by room_code
    const gameResult = await db.execute(
      sql`SELECT * FROM games WHERE room_code = ${input.room_code}`
    );

    const gameRows = gameResult.rows;
    if (!gameRows || gameRows.length === 0) {
      throw new Error('Game not found');
    }

    const game = gameRows[0] as any;

    // 2. Validate the game is in 'waiting' status
    if (game.status !== 'waiting') {
      throw new Error('Game has already started or is completed');
    }

    // 3. Check if there are at least 2 players
    const playerCountResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM players WHERE game_id = ${game.id}`
    );

    const playerCountRows = playerCountResult.rows;
    const currentPlayers = Number(playerCountRows[0]['count']);
    if (currentPlayers < 2) {
      throw new Error('Need at least 2 players to start the game');
    }

    // 4. Update game status to 'in_progress' and 5. Set started_at timestamp
    const updateResult = await db.execute(
      sql`UPDATE games 
          SET status = 'in_progress', 
              started_at = NOW(), 
              current_players = ${currentPlayers},
              draw_order = 0,
              drawn_numbers = '[]'::json
          WHERE id = ${game.id} 
          RETURNING *`
    );

    const updatedGameRows = updateResult.rows;
    const updatedGame = updatedGameRows[0] as any;

    // Parse drawn_numbers safely
    let drawnNumbers: number[] = [];
    try {
      if (updatedGame.drawn_numbers) {
        drawnNumbers = typeof updatedGame.drawn_numbers === 'string' 
          ? JSON.parse(updatedGame.drawn_numbers)
          : updatedGame.drawn_numbers;
      }
    } catch (e) {
      drawnNumbers = [];
    }

    // Return the updated game object with proper type conversions
    return {
      id: updatedGame.id,
      room_code: updatedGame.room_code,
      status: updatedGame.status as 'in_progress',
      max_players: updatedGame.max_players,
      current_players: updatedGame.current_players,
      drawn_numbers: drawnNumbers,
      draw_order: updatedGame.draw_order,
      created_at: new Date(updatedGame.created_at),
      started_at: new Date(updatedGame.started_at),
      completed_at: updatedGame.completed_at ? new Date(updatedGame.completed_at) : null
    };
  } catch (error) {
    console.error('Game start failed:', error);
    throw error;
  }
}
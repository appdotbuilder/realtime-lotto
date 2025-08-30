import { db } from '../db';
import { sql } from 'drizzle-orm';


export async function leaveGame(gameId: number, playerId: number): Promise<boolean> {
  try {

    // Start a transaction to ensure data consistency
    return await db.transaction(async (tx) => {
      // 1. First check if the game exists and validate it's still in 'waiting' status
      const gameCheck = await tx.execute(sql`
        SELECT id, status, current_players 
        FROM games 
        WHERE id = ${gameId}
      `);

      if (gameCheck.rows.length === 0) {
        throw new Error('Game not found');
      }

      // 2. Find the player and validate they belong to the specified game
      const playerCheck = await tx.execute(sql`
        SELECT id, game_id, player_name 
        FROM players 
        WHERE id = ${playerId} AND game_id = ${gameId}
      `);

      if (playerCheck.rows.length === 0) {
        throw new Error('Player not found in the specified game');
      }

      const game = gameCheck.rows[0] as { id: number; status: string; current_players: number };
      if (game.status !== 'waiting') {
        throw new Error('Cannot leave game that is not in waiting status');
      }

      // 3. Remove the player record from the database
      await tx.execute(sql`
        DELETE FROM players WHERE id = ${playerId}
      `);

      // 4. Decrement the game's current_players count
      const newCurrentPlayers = Math.max(0, game.current_players - 1);
      
      await tx.execute(sql`
        UPDATE games 
        SET current_players = ${newCurrentPlayers}
        WHERE id = ${gameId}
      `);

      // 6. If game has no players left, optionally clean up the game
      if (newCurrentPlayers === 0) {
        await tx.execute(sql`
          DELETE FROM games WHERE id = ${gameId}
        `);
      }

      // 5 & 7. Return success status
      // Note: Real-time event emission would typically be handled by the API layer
      // or a separate service, not within the database handler
      return true;
    });
  } catch (error) {
    console.error('Leave game failed:', error);
    throw error;
  }
};
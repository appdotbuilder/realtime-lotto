import { db } from '../db';
import { type JoinGameInput, type Player } from '../schema';
import { sql } from 'drizzle-orm';

export async function joinGame(input: JoinGameInput): Promise<Player> {
  try {
    // 1. Find the game by room_code
    const gameQuery = sql`
      SELECT * FROM games 
      WHERE room_code = ${input.room_code}
    `;
    const games = await db.execute(gameQuery);

    if (games.rows.length === 0) {
      throw new Error('Game not found');
    }

    const game = games.rows[0] as any;

    // 2. Validate the game is in 'waiting' status
    if (game.status !== 'waiting') {
      throw new Error('Game is not accepting new players');
    }

    // 3. Check if the game has space for more players
    if (game.current_players >= game.max_players) {
      throw new Error('Game is full');
    }

    // 4. Validate the player's selected numbers (5 unique numbers 1-50)
    // This validation is already done by Zod schema validation

    // 5. Create a new player record
    const insertPlayerQuery = sql`
      INSERT INTO players (game_id, player_name, selected_numbers, is_winner, joined_at)
      VALUES (${game.id}, ${input.player_name}, ${JSON.stringify(input.selected_numbers)}, false, NOW())
      RETURNING *
    `;
    const playerResult = await db.execute(insertPlayerQuery);
    const newPlayer = playerResult.rows[0] as any;

    // 6. Update the game's current_players count
    const updateGameQuery = sql`
      UPDATE games 
      SET current_players = current_players + 1
      WHERE id = ${game.id}
    `;
    await db.execute(updateGameQuery);

    // 7. Emit a real-time event for other players
    // TODO: Implement real-time event emission when WebSocket infrastructure is ready

    // 8. Return the created player object
    return {
      id: parseInt(newPlayer.id),
      game_id: parseInt(newPlayer.game_id),
      player_name: newPlayer.player_name,
      selected_numbers: typeof newPlayer.selected_numbers === 'string' 
        ? JSON.parse(newPlayer.selected_numbers) 
        : newPlayer.selected_numbers,
      is_winner: newPlayer.is_winner,
      joined_at: new Date(newPlayer.joined_at)
    };
  } catch (error) {
    console.error('Join game failed:', error);
    throw error;
  }
}
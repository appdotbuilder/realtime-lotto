import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';

// Import schema types
import { 
  createGameInputSchema, 
  joinGameInputSchema, 
  startGameInputSchema, 
  getGameInputSchema,
  drawNumberInputSchema,
  checkWinnersInputSchema,
  leaveGameInputSchema
} from './schema';

// Import handlers
import { createGame } from './handlers/create_game';
import { joinGame } from './handlers/join_game';
import { startGame } from './handlers/start_game';
import { getGame } from './handlers/get_game';
import { drawNumber } from './handlers/draw_number';
import { checkWinners } from './handlers/check_winners';
import { getGameHistory } from './handlers/get_game_history';
import { leaveGame } from './handlers/leave_game';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check endpoint
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Create a new lotto game with room code
  createGame: publicProcedure
    .input(createGameInputSchema)
    .mutation(({ input }) => createGame(input)),

  // Join an existing game with player name and number selection
  joinGame: publicProcedure
    .input(joinGameInputSchema)
    .mutation(({ input }) => joinGame(input)),

  // Start the number drawing process for a game
  startGame: publicProcedure
    .input(startGameInputSchema)
    .mutation(({ input }) => startGame(input)),

  // Get current game state including players and draw status
  getGame: publicProcedure
    .input(getGameInputSchema)
    .query(({ input }) => getGame(input)),

  // Internal procedure to draw next number (called by game engine)
  drawNumber: publicProcedure
    .input(drawNumberInputSchema)
    .mutation(({ input }) => drawNumber(input.gameId)),

  // Check for winners after all numbers drawn (called by game engine)
  checkWinners: publicProcedure
    .input(checkWinnersInputSchema)
    .mutation(({ input }) => checkWinners(input.gameId)),

  // Get history of completed games
  getGameHistory: publicProcedure
    .query(() => getGameHistory()),

  // Leave a game before it starts
  leaveGame: publicProcedure
    .input(leaveGameInputSchema)
    .mutation(({ input }) => leaveGame(input.gameId, input.playerId)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
  console.log('Lotto Game API ready for multiplayer real-time gaming!');
}

start();
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllCategories,
    getAllGameIds,
    getGameById,
    getAllPublishers,
    getFilteredGames,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

async function seedFilterableGames(db: Database): Promise<void> {
    const [strategy] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'strategy games' })
        .returning({ id: categories.id });
    const [adventure] = await db
        .insert(categories)
        .values({ name: 'Adventure', description: 'adventure games' })
        .returning({ id: categories.id });
    const [firstPublisher] = await db
        .insert(publishers)
        .values({ name: 'Acme Games', description: 'first publisher' })
        .returning({ id: publishers.id });
    const [secondPublisher] = await db
        .insert(publishers)
        .values({ name: 'Zeta Games', description: 'second publisher' })
        .returning({ id: publishers.id });

    await db.insert(games).values([
        {
            title: 'Adventure Acme',
            description: 'Adventure',
            starRating: 4,
            categoryId: adventure.id,
            publisherId: firstPublisher.id,
        },
        {
            title: 'Strategy Acme',
            description: 'Strategy',
            starRating: 4,
            categoryId: strategy.id,
            publisherId: firstPublisher.id,
        },
        {
            title: 'Strategy Zeta',
            description: 'Strategy',
            starRating: 4,
            categoryId: strategy.id,
            publisherId: secondPublisher.id,
        },
    ]);
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('filters games by one or more categories', async () => {
        await seedFilterableGames(db);
        const availableCategories = await getAllCategories(db);
        const strategy = availableCategories.find((category) => category.name === 'Strategy');
        const adventure = availableCategories.find((category) => category.name === 'Adventure');

        expect(strategy).toBeDefined();
        expect(adventure).toBeDefined();
        expect((await getFilteredGames(db, { categoryIds: [strategy!.id] })).map((game) => game.title))
            .toEqual(['Strategy Acme', 'Strategy Zeta']);
        expect((await getFilteredGames(db, { categoryIds: [strategy!.id, adventure!.id] })).map((game) => game.title))
            .toEqual(['Adventure Acme', 'Strategy Acme', 'Strategy Zeta']);
    });

    it('filters games by publisher and combines publisher and category filters', async () => {
        await seedFilterableGames(db);
        const availableCategories = await getAllCategories(db);
        const availablePublishers = await getAllPublishers(db);
        const strategy = availableCategories.find((category) => category.name === 'Strategy');
        const acme = availablePublishers.find((publisher) => publisher.name === 'Acme Games');

        expect(strategy).toBeDefined();
        expect(acme).toBeDefined();
        expect((await getFilteredGames(db, { publisherId: acme!.id })).map((game) => game.title))
            .toEqual(['Adventure Acme', 'Strategy Acme']);
        expect((await getFilteredGames(db, { categoryIds: [strategy!.id], publisherId: acme!.id }))
            .map((game) => game.title))
            .toEqual(['Strategy Acme']);
    });

    it('returns an empty list when no games match the filters', async () => {
        await seedFilterableGames(db);
        expect(await getFilteredGames(db, { publisherId: 99999 })).toEqual([]);
    });
});

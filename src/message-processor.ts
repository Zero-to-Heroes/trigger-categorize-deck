/* eslint-disable @typescript-eslint/no-use-before-define */
import SqlString from 'sqlstring';
import { assignArchetype } from './archetype-service';
import { getConnection } from './db/rds';
import { ReviewMessage } from './review-message';

export class MessageProcessor {
	public async buildStats(messages: readonly ReviewMessage[]): Promise<void> {
		await Promise.all(messages.map(msg => this.buildStat(msg)));
	}

	private async buildStat(message: ReviewMessage): Promise<void> {
		const { playerArchetypeId, opponentArchetypeId } = await assignArchetype(message);
		if (!playerArchetypeId || !message.playerDecklist) {
			console.log('no archetype, retuyrning', playerArchetypeId, message.playerDecklist);
			return;
		}

		const escape = SqlString.escape;
		const query = `
			UPDATE replay_summary
			SET 
				playerArchetypeId = ${escape(playerArchetypeId)},
				opponentArchetypeId = ${escape(opponentArchetypeId)}
			WHERE
				reviewId = ${escape(message.reviewId)};
		`;
		console.log('running query', query);
		const mysql = await getConnection();
		await mysql.query(query);
		mysql.end();
	}
}

import { AbstractRepository } from "./AbstractRepository.js"

export class PegMonitoredTokenRepository extends AbstractRepository {
  async getActiveTokens() {
    return this.prismaClient.peg_monitored_tokens.findMany({
      where: { active: true },
    })
  }
}

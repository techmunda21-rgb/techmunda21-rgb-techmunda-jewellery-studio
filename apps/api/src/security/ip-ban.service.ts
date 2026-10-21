import { Injectable } from '@nestjs/common';

/** Temporary IP blocks (in memory: per API instance, cleared on restart — use the host/CDN firewall for permanent blocks). */
@Injectable()
export class IpBanService {
  private readonly bans = new Map<string, number>();

  ban(ip: string, ms = 3_600_000) {
    this.bans.set(ip, Date.now() + ms);
  }
  isBanned(ip: string | undefined) {
    if (!ip) return false;
    const until = this.bans.get(ip);
    if (!until) return false;
    if (until < Date.now()) {
      this.bans.delete(ip);
      return false;
    }
    return true;
  }
  count() {
    for (const [ip, until] of this.bans) if (until < Date.now()) this.bans.delete(ip);
    return this.bans.size;
  }
  clear() {
    this.bans.clear();
  }
}

export interface ClientPrincipalClaim {
  typ: string;
  val: string;
}

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
  claims?: ClientPrincipalClaim[];
  /** SWA 生の userId（IdP リンク前）。リンク解決後に付与 */
  rawUserId?: string;
}

export interface AuthMeResponse {
  clientPrincipal: ClientPrincipal | null;
}

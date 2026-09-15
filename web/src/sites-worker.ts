interface StaticAssets {
  fetch(request: Request): Promise<Response>;
}

interface SiteEnvironment {
  ASSETS: StaticAssets;
}

const worker = {
  fetch(request: Request, environment: SiteEnvironment): Promise<Response> {
    return environment.ASSETS.fetch(request);
  },
};

export default worker;

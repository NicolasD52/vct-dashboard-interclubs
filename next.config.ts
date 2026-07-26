import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les routes API lisent data/ avec fs à l'exécution. Le traçage de fichiers ne
  // peut pas le déduire (les chemins sont construits dynamiquement), donc on
  // inclut le dossier explicitement, sinon les fonctions serverless sont
  // déployées sans les données.
  outputFileTracingIncludes: {
    "/*": ["./data/**/*"],
  },
};

export default nextConfig;

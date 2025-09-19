{
  description = "Xibo Ruby Scripts Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            ruby_3_3
            bundler
          ];

          shellHook = ''
            export RUBYOPT="-W0"
            echo "Ruby development environment for Xibo scripts"
            echo "Ruby version: $(ruby --version)"
          '';
        };
      });
}
{
  description = "Xibo Ruby Scripts Environment";

  inputs = {
    nixpkgs.url = "nixpkgs";
  };

  outputs =
    {
      self,
      nixpkgs,
    }:
    let
      system = builtins.currentSystem;
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            ruby_3_4
            rubyPackages_3_4.psych
            bundler
            buildah
            podman
            gh
          ];

          shellHook = ''
            export RUBYOPT="-W0"
            
            # Add project bin directory to PATH
            export PATH="$PWD/bin:$PATH"
            
            echo "Ruby development environment for Xibo scripts"
            echo "Ruby version: $(ruby --version)"
            echo "Buildah version: $(buildah --version 2>/dev/null | head -1)"

            # Auto-install gems if needed
            if [ ! -d .bundle ] || [ ! -f Gemfile.lock ]; then
              echo "Installing Ruby gems..."
              bundle install
            fi

            # List available commands from bin directory
            if [ -d "$PWD/bin" ] && [ -n "$(ls -A $PWD/bin 2>/dev/null)" ]; then
              echo ""
              echo "Available commands from bin/:"
              for script in "$PWD/bin"/*; do
                if [ -x "$script" ] && [ -f "$script" ]; then
                  script_name=$(basename "$script")
                  echo "  $script_name"
                fi
              done
            fi
          '';
        };
      };
}

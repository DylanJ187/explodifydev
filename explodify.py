"""
Explodify — CAD assembly to exploded-view animation.
Entry point / CLI.
"""
import argparse

def main():
    parser = argparse.ArgumentParser(description="Explodify: CAD to exploded-view animation")
    parser.add_argument("--input", required=True, help="Path to CAD/mesh file (.glb, .obj, .stl)")
    parser.add_argument("--explode", type=float, default=1.5, help="Explosion scalar multiplier (default: 1.5)")
    parser.add_argument("--output", default="exploded_view.mp4", help="Output video path")
    args = parser.parse_args()

    print(f"[Explodify] Input: {args.input}")
    print(f"[Explodify] Explosion factor: {args.explode}")
    print(f"[Explodify] Output: {args.output}")
    print("[Explodify] Pipeline not yet implemented — stay tuned!")

if __name__ == "__main__":
    main()

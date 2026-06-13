"""
run_seed.py — Run once from visual-ml-service/
    python run_seed.py

Seeds all products directly into MongoDB. No server needed.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from seed_all_categories import main
main()

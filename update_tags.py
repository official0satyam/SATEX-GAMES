
import json

def get_tags(game):
    title = game.get('title', '').lower()
    category = game.get('category', '').lower()
    tags = set()
    
    # Base tags from category
    tags.add(category)
    
    # Logic for specific keywords
    if 'snake' in title:
        tags.update(['classic', 'reptile', 'slither'])
    if 'car' in title or 'racing' in category or 'speed' in title or 'nitro' in title or 'hill' in title:
        tags.update(['driving', 'vehicle', 'automotive', 'fast'])
    if 'puzzle' in category or '2048' in title or 'logic' in title or 'memory' in title or 'brain' in title:
        tags.update(['brain', 'thinking', 'strategy'])
    if 'run' in title or 'surfer' in title or 'temple' in title or 'jetpack' in title or 'jump' in title:
        tags.update(['endless runner', 'survival', 'parkour'])
    if 'candy' in title or 'fruit' in title or 'cut' in title:
        tags.update(['casual', 'colorful', 'food'])
    if 'bird' in title or 'fly' in title or 'flap' in title:
        tags.update(['flying', 'physics', 'animal'])
    if 'multiplayer' in category or '.io' in title:
        tags.update(['online', 'io', 'competitive'])
    if 'zombie' in title:
        tags.update(['undead', 'defense', 'horror'])
        
    return list(tags)

try:
    with open('d:/Archad/games.json', 'r') as f:
        games = json.load(f)
        
    for game in games:
        # Generate tags, preserving existing if any (though likely none)
        existing_tags = set(game.get('tags', []))
        new_tags = get_tags(game)
        existing_tags.update(new_tags)
        game['tags'] = list(existing_tags)
        
    with open('d:/Archad/games.json', 'w') as f:
        json.dump(games, f, indent=2)
        
    print(f"Successfully updated {len(games)} games with tags.")
    
except Exception as e:
    print(f"Error: {e}")

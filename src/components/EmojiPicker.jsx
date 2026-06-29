export default function EmojiPicker({
  emojis,
  isLoading,
  onPick,
  onQueryChange,
  query,
}) {
  return (
    <div className="emoji-picker" role="dialog" aria-label="이모지 선택">
      <input
        className="emoji-picker-search"
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="이모지 검색"
        value={query}
      />
      <div className="emoji-picker-grid">
        {isLoading ? (
          <p className="emoji-picker-empty">이모지 불러오는 중...</p>
        ) : emojis.length === 0 ? (
          <p className="emoji-picker-empty">검색 결과가 없습니다.</p>
        ) : (
          emojis.map((emoji) => (
            <button
              className="emoji-picker-item"
              key={`${emoji.name}:${emoji.emoji}`}
              onClick={() => onPick(emoji)}
              title={emoji.name}
              type="button"
            >
              <span>{emoji.emoji}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

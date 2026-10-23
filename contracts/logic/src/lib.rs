//! Pure, host-testable arithmetic shared by the Daily on Dot contracts and app.
//!
//! Both implementations are pinned by `shared/day-test-vectors.json`.

#![cfg_attr(not(feature = "std"), no_std)]

pub const EPOCH_SECONDS: u64 = 1_767_225_600;
pub const DAY_SECONDS: u64 = 86_400;
pub const GAME_COUNT: u8 = 64;
pub const MAX_DAY_BATCH: u8 = 64;
/// Daily Word is one six-letter word a day (D16).
pub const WORD_LENGTH: usize = 6;
/// Words are six bytes each, so one authoring batch can carry far more than
/// the eight-entry batches of the puzzle registries.
pub const MAX_WORD_DAYS_PER_BATCH: usize = 64;
pub const MAX_WORD_LIST_PAGE: u8 = 24;
pub const MAX_CHESS_PUZZLES_PER_BATCH: usize = 8;
pub const MAX_CHESS_SET_PAGE: u8 = 24;
pub const MINI_SIZE: usize = 5;
pub const MINI_CELLS: usize = MINI_SIZE * MINI_SIZE;
pub const MINI_BLACK: u8 = b'#';
pub const MINI_MIN_BLACKS: usize = 2;
pub const MINI_MAX_BLACKS: usize = 5;
/// No two-letter entries: every run of white squares is at least this long.
pub const MINI_MIN_ENTRY: usize = 3;
pub const MINI_MAX_CLUE_CHARS: usize = 50;
pub const MAX_MINI_PUZZLES_PER_BATCH: usize = 8;
pub const MAX_MINI_SET_PAGE: u8 = 24;
pub const CONNECTIONS_GROUP_COUNT: usize = 4;
pub const CONNECTIONS_WORDS_PER_GROUP: usize = 4;
pub const MAX_CONNECTIONS_LABEL_BYTES: usize = 40;
pub const MAX_CONNECTIONS_WORD_BYTES: usize = 24;
pub const MAX_CONNECTIONS_PUZZLES_PER_BATCH: usize = 8;
pub const MAX_CONNECTIONS_SET_PAGE: u8 = 24;

/// Score kinds a game id can be set to (`DailyScores::set_game_kind`).
pub const GAME_KIND_COUNT: u8 = 0;
pub const GAME_KIND_SECONDS: u8 = 1;
/// Count-type scores (guesses, attempts, mistakes) bucket as the exact score
/// 1..=30; 31 holds every score of 31 and above ("31+").
pub const COUNT_BUCKET_MAX: u8 = 31;
/// Seconds-type scores bucket in 15-second steps: bucket 0 is 0–14 s, 119 is
/// 1785–1799 s, and 120 holds everything from 30 minutes up ("30 min+").
pub const SECONDS_BUCKET_STEP: u32 = 15;
pub const SECONDS_BUCKET_MAX: u8 = 120;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DayIndexError {
    BeforeEpoch,
    OutOfRange,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IndexForDayError {
    EmptySeries,
    BeforeStart,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BitmapError {
    GameOutOfRange,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct DayBitmaps {
    pub played: u64,
    pub solved: u64,
    pub ontime: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RecordError {
    GameOutOfRange,
    FutureDay,
    AlreadyRecorded,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DayBatchError {
    TooLarge,
}

/// How a game's `score` is minimised (D13, amended 2026-10-21): a count of
/// guesses/attempts/mistakes, or elapsed seconds. The contract stores one
/// kind per game id; it never knows which game is which.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GameKind {
    Count,
    Seconds,
}

impl GameKind {
    pub fn from_u8(value: u8) -> Option<GameKind> {
        match value {
            GAME_KIND_COUNT => Some(GameKind::Count),
            GAME_KIND_SECONDS => Some(GameKind::Seconds),
            _ => None,
        }
    }

    pub fn to_u8(self) -> u8 {
        match self {
            GameKind::Count => GAME_KIND_COUNT,
            GameKind::Seconds => GAME_KIND_SECONDS,
        }
    }

    /// The highest bucket index for this kind (the open-ended "and above" one).
    pub fn bucket_max(self) -> u8 {
        match self {
            GameKind::Count => COUNT_BUCKET_MAX,
            GameKind::Seconds => SECONDS_BUCKET_MAX,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WordAnswerError {
    InvalidWordLength,
    NonLowercaseAscii,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WordBatchError {
    Empty,
    TooLarge,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WordListWriteError {
    NotCreator,
    Sealed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WordListPageError {
    Empty,
    TooLarge,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WordListSealError {
    Empty,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChessFenError {
    WrongFieldCount,
    WrongRankCount,
    InvalidRank,
    InvalidSideToMove,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChessMovesError {
    Empty,
    InvalidMove,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChessPuzzleBatchError {
    Empty,
    TooLarge,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChessSetWriteError {
    NotCreator,
    Sealed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChessSetPageError {
    Empty,
    TooLarge,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChessSetSealError {
    Empty,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MiniGridError {
    WrongLength,
    BadCharacter,
    BlackCount,
    ShortEntry,
}

/// Entry counts derived from a grid; the clue lists must match them exactly.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MiniShape {
    pub across: u8,
    pub down: u8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MiniClueError {
    Empty,
    TooLong,
    ControlCharacter,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MiniPuzzleError {
    Grid(MiniGridError),
    Clue(MiniClueError),
    WrongAcrossCount,
    WrongDownCount,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MiniPuzzleBatchError {
    Empty,
    TooLarge,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MiniSetWriteError {
    NotCreator,
    Sealed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MiniSetPageError {
    Empty,
    TooLarge,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MiniSetSealError {
    Empty,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConnectionsPuzzleError {
    WrongGroupCount,
    WrongWordCount,
    EmptyLabel,
    LabelTooLong,
    BadWord,
    WordTooLong,
    BadTier,
    DuplicateTier,
    DuplicateWord,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConnectionsPuzzleBatchError {
    Empty,
    TooLarge,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConnectionsSetWriteError {
    NotCreator,
    Sealed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConnectionsSetPageError {
    Empty,
    TooLarge,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConnectionsSetSealError {
    Empty,
}

/// One authored group as the validator sees it. The contract's ABI input and
/// the host tests implement this, so the rules live here once (D3, D19).
pub trait ConnectionsGroup {
    fn label(&self) -> &str;
    fn word_count(&self) -> usize;
    fn word(&self, index: usize) -> &str;
    fn tier(&self) -> u8;
}

/// Returns the UTC day offset from the hub epoch.
///
/// A `Result` keeps invalid pre-epoch timestamps and days that cannot fit the
/// contract's `u32` ABI from silently wrapping into valid-looking days.
pub fn day_index(now_seconds: u64) -> Result<u32, DayIndexError> {
    let elapsed = now_seconds
        .checked_sub(EPOCH_SECONDS)
        .ok_or(DayIndexError::BeforeEpoch)?;
    u32::try_from(elapsed / DAY_SECONDS).map_err(|_| DayIndexError::OutOfRange)
}

/// Selects the content offset for a launched series, wrapping at `count`.
pub fn index_for_day(day: u32, start_day: u32, count: u32) -> Result<u32, IndexForDayError> {
    if count == 0 {
        return Err(IndexForDayError::EmptySeries);
    }

    let elapsed = day
        .checked_sub(start_day)
        .ok_or(IndexForDayError::BeforeStart)?;
    Ok(elapsed % count)
}

fn game_mask(game_id: u8) -> Result<u64, BitmapError> {
    1u64.checked_shl(game_id as u32)
        .ok_or(BitmapError::GameOutOfRange)
}

pub fn set_game_bit(bitmap: u64, game_id: u8) -> Result<u64, BitmapError> {
    Ok(bitmap | game_mask(game_id)?)
}

pub fn has_game_bit(bitmap: u64, game_id: u8) -> Result<bool, BitmapError> {
    Ok(bitmap & game_mask(game_id)? != 0)
}

/// Applies the bitmap part of one completion write.
///
/// `ontime` is intentionally not an input: the day comparison is the
/// contract's integrity boundary for streaks.
pub fn record_day_bits(
    bits: DayBitmaps,
    game_id: u8,
    day: u32,
    current_day: u32,
    solved: bool,
) -> Result<DayBitmaps, RecordError> {
    if game_id >= GAME_COUNT {
        return Err(RecordError::GameOutOfRange);
    }
    if day > current_day {
        return Err(RecordError::FutureDay);
    }
    if has_game_bit(bits.played, game_id).map_err(|_| RecordError::GameOutOfRange)? {
        return Err(RecordError::AlreadyRecorded);
    }

    Ok(DayBitmaps {
        played: set_game_bit(bits.played, game_id).map_err(|_| RecordError::GameOutOfRange)?,
        solved: if solved {
            set_game_bit(bits.solved, game_id).map_err(|_| RecordError::GameOutOfRange)?
        } else {
            bits.solved
        },
        ontime: if day == current_day {
            set_game_bit(bits.ontime, game_id).map_err(|_| RecordError::GameOutOfRange)?
        } else {
            bits.ontime
        },
    })
}

/// The histogram bucket a minimised score lands in.
///
/// Count scores below 1 cannot come from a finished game (a finish takes at
/// least one guess); they are clamped up to bucket 1 rather than given a
/// bucket of their own, so the bucket set stays 1..=31.
pub fn score_bucket(kind: GameKind, score: u32) -> u8 {
    match kind {
        GameKind::Count => score.clamp(1, COUNT_BUCKET_MAX as u32) as u8,
        GameKind::Seconds => (score / SECONDS_BUCKET_STEP).min(SECONDS_BUCKET_MAX as u32) as u8,
    }
}

/// Which histogram bucket, if any, one `record` increments.
///
/// The day's distribution is of finishers who played on the day itself: a
/// backfilled (archive) record and an unsolved record return `None`, so a
/// late finisher can see the day's distribution but never changes it.
pub fn histogram_bucket_for_record(
    kind: GameKind,
    score: u32,
    day: u32,
    current_day: u32,
    solved: bool,
) -> Option<u8> {
    if day != current_day || !solved {
        return None;
    }
    Some(score_bucket(kind, score))
}

/// Finishers with a strictly better (lower) bucket than `bucket`.
pub fn better_count(buckets: &[(u8, u32)], bucket: u8) -> u32 {
    buckets
        .iter()
        .filter(|(other, _)| *other < bucket)
        .fold(0u32, |sum, (_, count)| sum.saturating_add(*count))
}

/// "Top N% today": the finisher's rank among `total` finishers as a share,
/// where `better` finishers scored strictly lower. Ties share the better
/// rank, so every finisher in the best bucket is top `100 / total` percent.
/// Rounded to the nearest whole percent, never below 1. `None` when there is
/// no one to rank against (`total == 0`) or the inputs disagree.
pub fn top_percent(total: u32, better: u32) -> Option<u32> {
    if total == 0 || better >= total {
        return None;
    }
    let rank = better as u64 + 1;
    let percent = (rank * 100 + total as u64 / 2) / total as u64;
    Some(percent.max(1) as u32)
}

pub fn validate_day_batch_count(count: u8) -> Result<(), DayBatchError> {
    if count > MAX_DAY_BATCH {
        return Err(DayBatchError::TooLarge);
    }
    Ok(())
}

/// One daily answer: exactly six lowercase ASCII letters.
pub fn validate_word_answer(word: &str) -> Result<(), WordAnswerError> {
    if !word.bytes().all(|byte| byte.is_ascii_lowercase()) {
        return Err(WordAnswerError::NonLowercaseAscii);
    }
    if word.len() != WORD_LENGTH {
        return Err(WordAnswerError::InvalidWordLength);
    }
    Ok(())
}

pub fn validate_word_batch_count(count: usize) -> Result<(), WordBatchError> {
    if count == 0 {
        return Err(WordBatchError::Empty);
    }
    if count > MAX_WORD_DAYS_PER_BATCH {
        return Err(WordBatchError::TooLarge);
    }
    Ok(())
}

pub fn validate_word_list_write(
    caller: [u8; 20],
    creator: [u8; 20],
    sealed: bool,
) -> Result<(), WordListWriteError> {
    if caller != creator {
        return Err(WordListWriteError::NotCreator);
    }
    if sealed {
        return Err(WordListWriteError::Sealed);
    }
    Ok(())
}

pub fn word_list_is_catalog_visible(sealed: bool) -> bool {
    sealed
}

pub fn validate_word_list_page_limit(limit: u8) -> Result<(), WordListPageError> {
    if limit == 0 {
        return Err(WordListPageError::Empty);
    }
    if limit > MAX_WORD_LIST_PAGE {
        return Err(WordListPageError::TooLarge);
    }
    Ok(())
}

pub fn validate_word_list_sealable(day_count: u32) -> Result<(), WordListSealError> {
    if day_count == 0 {
        return Err(WordListSealError::Empty);
    }
    Ok(())
}

pub fn validate_chess_fen(fen: &str) -> Result<(), ChessFenError> {
    let mut fields = fen.split(' ');
    let board = fields.next().ok_or(ChessFenError::WrongFieldCount)?;
    let side_to_move = fields.next().ok_or(ChessFenError::WrongFieldCount)?;
    let castling = fields.next().ok_or(ChessFenError::WrongFieldCount)?;
    let en_passant = fields.next().ok_or(ChessFenError::WrongFieldCount)?;
    let halfmove = fields.next().ok_or(ChessFenError::WrongFieldCount)?;
    let fullmove = fields.next().ok_or(ChessFenError::WrongFieldCount)?;
    if fields.next().is_some()
        || [
            board,
            side_to_move,
            castling,
            en_passant,
            halfmove,
            fullmove,
        ]
        .iter()
        .any(|field| field.is_empty())
    {
        return Err(ChessFenError::WrongFieldCount);
    }

    let mut ranks = board.split('/');
    for _ in 0..8 {
        let rank = ranks.next().ok_or(ChessFenError::WrongRankCount)?;
        let mut square_count = 0u8;
        for byte in rank.bytes() {
            let occupied = match byte {
                b'1'..=b'8' => byte - b'0',
                b'P' | b'N' | b'B' | b'R' | b'Q' | b'K' | b'p' | b'n' | b'b' | b'r' | b'q'
                | b'k' => 1,
                _ => return Err(ChessFenError::InvalidRank),
            };
            square_count = square_count
                .checked_add(occupied)
                .ok_or(ChessFenError::InvalidRank)?;
            if square_count > 8 {
                return Err(ChessFenError::InvalidRank);
            }
        }
        if square_count != 8 {
            return Err(ChessFenError::InvalidRank);
        }
    }
    if ranks.next().is_some() {
        return Err(ChessFenError::WrongRankCount);
    }

    if side_to_move != "w" && side_to_move != "b" {
        return Err(ChessFenError::InvalidSideToMove);
    }
    Ok(())
}

fn valid_uci_move(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 4 && bytes.len() != 5 {
        return false;
    }
    if !matches!(bytes[0], b'a'..=b'h')
        || !matches!(bytes[1], b'1'..=b'8')
        || !matches!(bytes[2], b'a'..=b'h')
        || !matches!(bytes[3], b'1'..=b'8')
    {
        return false;
    }
    bytes.len() == 4 || matches!(bytes[4], b'q' | b'r' | b'b' | b'n')
}

pub fn validate_chess_moves(moves: &str) -> Result<(), ChessMovesError> {
    if moves.is_empty() {
        return Err(ChessMovesError::Empty);
    }
    if moves.split(' ').any(|value| !valid_uci_move(value)) {
        return Err(ChessMovesError::InvalidMove);
    }
    Ok(())
}

pub fn validate_chess_puzzle_batch_count(count: usize) -> Result<(), ChessPuzzleBatchError> {
    if count == 0 {
        return Err(ChessPuzzleBatchError::Empty);
    }
    if count > MAX_CHESS_PUZZLES_PER_BATCH {
        return Err(ChessPuzzleBatchError::TooLarge);
    }
    Ok(())
}

pub fn validate_chess_set_write(
    caller: [u8; 20],
    creator: [u8; 20],
    sealed: bool,
) -> Result<(), ChessSetWriteError> {
    if caller != creator {
        return Err(ChessSetWriteError::NotCreator);
    }
    if sealed {
        return Err(ChessSetWriteError::Sealed);
    }
    Ok(())
}

pub fn chess_set_is_catalog_visible(sealed: bool) -> bool {
    sealed
}

pub fn validate_chess_set_page_limit(limit: u8) -> Result<(), ChessSetPageError> {
    if limit == 0 {
        return Err(ChessSetPageError::Empty);
    }
    if limit > MAX_CHESS_SET_PAGE {
        return Err(ChessSetPageError::TooLarge);
    }
    Ok(())
}

pub fn validate_chess_set_sealable(puzzle_count: u32) -> Result<(), ChessSetSealError> {
    if puzzle_count == 0 {
        return Err(ChessSetSealError::Empty);
    }
    Ok(())
}

/// The Daily Mini shape rule: 25 squares of `A`–`Z` or `#`, 2–5 blacks, and
/// every across and down run of white squares at least three long, so every
/// white square is checked both ways and no entry has two letters. Returns
/// how many across and down entries the grid numbers.
pub fn validate_mini_grid(grid: &str) -> Result<MiniShape, MiniGridError> {
    let bytes = grid.as_bytes();
    if bytes.len() != MINI_CELLS {
        return Err(MiniGridError::WrongLength);
    }
    if !bytes
        .iter()
        .all(|byte| byte.is_ascii_uppercase() || *byte == MINI_BLACK)
    {
        return Err(MiniGridError::BadCharacter);
    }
    let blacks = bytes.iter().filter(|byte| **byte == MINI_BLACK).count();
    if !(MINI_MIN_BLACKS..=MINI_MAX_BLACKS).contains(&blacks) {
        return Err(MiniGridError::BlackCount);
    }

    let is_black = |row: usize, col: usize| bytes[row * MINI_SIZE + col] == MINI_BLACK;
    let mut across = 0u8;
    let mut down = 0u8;
    for line in 0..MINI_SIZE {
        let mut across_run = 0usize;
        let mut down_run = 0usize;
        for step in 0..=MINI_SIZE {
            let across_white = step < MINI_SIZE && !is_black(line, step);
            let down_white = step < MINI_SIZE && !is_black(step, line);
            if across_white {
                across_run += 1;
            } else {
                if across_run > 0 && across_run < MINI_MIN_ENTRY {
                    return Err(MiniGridError::ShortEntry);
                }
                if across_run > 0 {
                    across += 1;
                }
                across_run = 0;
            }
            if down_white {
                down_run += 1;
            } else {
                if down_run > 0 && down_run < MINI_MIN_ENTRY {
                    return Err(MiniGridError::ShortEntry);
                }
                if down_run > 0 {
                    down += 1;
                }
                down_run = 0;
            }
        }
    }
    Ok(MiniShape { across, down })
}

/// One clue: nonempty, at most 50 characters, no control characters.
pub fn validate_mini_clue(clue: &str) -> Result<(), MiniClueError> {
    if clue.is_empty() {
        return Err(MiniClueError::Empty);
    }
    if clue.chars().any(char::is_control) {
        return Err(MiniClueError::ControlCharacter);
    }
    if clue.chars().count() > MINI_MAX_CLUE_CHARS {
        return Err(MiniClueError::TooLong);
    }
    Ok(())
}

/// A whole puzzle: a valid grid whose clue lists match its entry counts.
pub fn validate_mini_puzzle<T: AsRef<str>>(
    grid: &str,
    across: &[T],
    down: &[T],
) -> Result<MiniShape, MiniPuzzleError> {
    let shape = validate_mini_grid(grid).map_err(MiniPuzzleError::Grid)?;
    if across.len() != shape.across as usize {
        return Err(MiniPuzzleError::WrongAcrossCount);
    }
    if down.len() != shape.down as usize {
        return Err(MiniPuzzleError::WrongDownCount);
    }
    for clue in across.iter().chain(down.iter()) {
        validate_mini_clue(clue.as_ref()).map_err(MiniPuzzleError::Clue)?;
    }
    Ok(shape)
}

pub fn validate_mini_puzzle_batch_count(count: usize) -> Result<(), MiniPuzzleBatchError> {
    if count == 0 {
        return Err(MiniPuzzleBatchError::Empty);
    }
    if count > MAX_MINI_PUZZLES_PER_BATCH {
        return Err(MiniPuzzleBatchError::TooLarge);
    }
    Ok(())
}

pub fn validate_mini_set_write(
    caller: [u8; 20],
    creator: [u8; 20],
    sealed: bool,
) -> Result<(), MiniSetWriteError> {
    if caller != creator {
        return Err(MiniSetWriteError::NotCreator);
    }
    if sealed {
        return Err(MiniSetWriteError::Sealed);
    }
    Ok(())
}

pub fn mini_set_is_catalog_visible(sealed: bool) -> bool {
    sealed
}

pub fn validate_mini_set_page_limit(limit: u8) -> Result<(), MiniSetPageError> {
    if limit == 0 {
        return Err(MiniSetPageError::Empty);
    }
    if limit > MAX_MINI_SET_PAGE {
        return Err(MiniSetPageError::TooLarge);
    }
    Ok(())
}

pub fn validate_mini_set_sealable(puzzle_count: u32) -> Result<(), MiniSetSealError> {
    if puzzle_count == 0 {
        return Err(MiniSetSealError::Empty);
    }
    Ok(())
}

/// A word is one trimmed, nonempty, bounded UTF-8 string: "ice cream" and
/// "t-shirt" are words, "" and " bat" are not.
fn valid_connections_word(word: &str) -> Result<(), ConnectionsPuzzleError> {
    if word.is_empty() || word.trim() != word {
        return Err(ConnectionsPuzzleError::BadWord);
    }
    if word.len() > MAX_CONNECTIONS_WORD_BYTES {
        return Err(ConnectionsPuzzleError::WordTooLong);
    }
    Ok(())
}

/// Four labelled groups of four distinct words, tiers 0–3 used once each.
/// Distinctness ignores ASCII case so "Bat" and "bat" cannot both appear.
pub fn validate_connections_puzzle<G: ConnectionsGroup>(
    groups: &[G],
) -> Result<(), ConnectionsPuzzleError> {
    if groups.len() != CONNECTIONS_GROUP_COUNT {
        return Err(ConnectionsPuzzleError::WrongGroupCount);
    }

    let mut tiers_seen = [false; CONNECTIONS_GROUP_COUNT];
    for group in groups {
        let label = group.label();
        if label.is_empty() || label.trim() != label {
            return Err(ConnectionsPuzzleError::EmptyLabel);
        }
        if label.len() > MAX_CONNECTIONS_LABEL_BYTES {
            return Err(ConnectionsPuzzleError::LabelTooLong);
        }
        if group.word_count() != CONNECTIONS_WORDS_PER_GROUP {
            return Err(ConnectionsPuzzleError::WrongWordCount);
        }
        for index in 0..CONNECTIONS_WORDS_PER_GROUP {
            valid_connections_word(group.word(index))?;
        }
        let tier = group.tier() as usize;
        if tier >= CONNECTIONS_GROUP_COUNT {
            return Err(ConnectionsPuzzleError::BadTier);
        }
        if tiers_seen[tier] {
            return Err(ConnectionsPuzzleError::DuplicateTier);
        }
        tiers_seen[tier] = true;
    }

    let total = CONNECTIONS_GROUP_COUNT * CONNECTIONS_WORDS_PER_GROUP;
    for left in 0..total {
        let left_word = groups[left / CONNECTIONS_WORDS_PER_GROUP]
            .word(left % CONNECTIONS_WORDS_PER_GROUP);
        for right in (left + 1)..total {
            let right_word = groups[right / CONNECTIONS_WORDS_PER_GROUP]
                .word(right % CONNECTIONS_WORDS_PER_GROUP);
            if left_word.eq_ignore_ascii_case(right_word) {
                return Err(ConnectionsPuzzleError::DuplicateWord);
            }
        }
    }
    Ok(())
}

pub fn validate_connections_puzzle_batch_count(
    count: usize,
) -> Result<(), ConnectionsPuzzleBatchError> {
    if count == 0 {
        return Err(ConnectionsPuzzleBatchError::Empty);
    }
    if count > MAX_CONNECTIONS_PUZZLES_PER_BATCH {
        return Err(ConnectionsPuzzleBatchError::TooLarge);
    }
    Ok(())
}

pub fn validate_connections_set_write(
    caller: [u8; 20],
    creator: [u8; 20],
    sealed: bool,
) -> Result<(), ConnectionsSetWriteError> {
    if caller != creator {
        return Err(ConnectionsSetWriteError::NotCreator);
    }
    if sealed {
        return Err(ConnectionsSetWriteError::Sealed);
    }
    Ok(())
}

pub fn connections_set_is_catalog_visible(sealed: bool) -> bool {
    sealed
}

pub fn validate_connections_set_page_limit(
    limit: u8,
) -> Result<(), ConnectionsSetPageError> {
    if limit == 0 {
        return Err(ConnectionsSetPageError::Empty);
    }
    if limit > MAX_CONNECTIONS_SET_PAGE {
        return Err(ConnectionsSetPageError::TooLarge);
    }
    Ok(())
}

pub fn validate_connections_set_sealable(
    puzzle_count: u32,
) -> Result<(), ConnectionsSetSealError> {
    if puzzle_count == 0 {
        return Err(ConnectionsSetSealError::Empty);
    }
    Ok(())
}

#[cfg(test)]
mod tests;

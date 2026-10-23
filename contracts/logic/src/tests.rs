use serde::Deserialize;

use super::{
    chess_set_is_catalog_visible, day_index, has_game_bit, index_for_day, record_day_bits,
    set_game_bit, validate_chess_fen, validate_chess_moves, validate_chess_puzzle_batch_count,
    validate_chess_set_page_limit, validate_chess_set_sealable, validate_chess_set_write,
    validate_day_batch_count, validate_word_answer, validate_word_batch_count,
    validate_word_list_page_limit, validate_word_list_sealable, validate_word_list_write,
    word_list_is_catalog_visible, BitmapError, ChessFenError, ChessMovesError,
    ChessPuzzleBatchError, ChessSetPageError, ChessSetSealError, ChessSetWriteError, DayBatchError,
    DayBitmaps, DayIndexError, IndexForDayError, RecordError, WordAnswerError,
    WordBatchError, WordListPageError, WordListSealError, WordListWriteError,
    MAX_CHESS_PUZZLES_PER_BATCH, MAX_CHESS_SET_PAGE, MAX_WORD_DAYS_PER_BATCH,
    MAX_WORD_LIST_PAGE,
};
use super::{
    mini_set_is_catalog_visible, validate_mini_clue, validate_mini_grid, validate_mini_puzzle,
    validate_mini_puzzle_batch_count, validate_mini_set_page_limit, validate_mini_set_sealable,
    validate_mini_set_write, MiniClueError, MiniGridError, MiniPuzzleBatchError, MiniPuzzleError,
    MiniSetPageError, MiniSetSealError, MiniSetWriteError, MiniShape, MAX_MINI_PUZZLES_PER_BATCH,
    MAX_MINI_SET_PAGE, MINI_MAX_CLUE_CHARS,
};
use super::{
    connections_set_is_catalog_visible, validate_connections_puzzle,
    validate_connections_puzzle_batch_count, validate_connections_set_page_limit,
    validate_connections_set_sealable, validate_connections_set_write, ConnectionsGroup,
    ConnectionsPuzzleBatchError, ConnectionsPuzzleError, ConnectionsSetPageError,
    ConnectionsSetSealError, ConnectionsSetWriteError, MAX_CONNECTIONS_PUZZLES_PER_BATCH,
    MAX_CONNECTIONS_SET_PAGE,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestVectors {
    day_index: Vec<DayIndexVector>,
    index_for_day: Vec<IndexForDayVector>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DayIndexVector {
    name: String,
    now_seconds: u64,
    expected: Option<u32>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexForDayVector {
    name: String,
    day: u32,
    start_day: u32,
    count: u32,
    expected: Option<u32>,
    error: Option<String>,
}

fn vectors() -> TestVectors {
    serde_json::from_str(include_str!("../../../shared/day-test-vectors.json"))
        .expect("shared day vectors must be valid JSON")
}

#[test]
fn shared_day_index_vectors_match() {
    for vector in vectors().day_index {
        let expected = match (vector.expected, vector.error.as_deref()) {
            (Some(day), None) => Ok(day),
            (None, Some("before_epoch")) => Err(DayIndexError::BeforeEpoch),
            (None, Some("out_of_range")) => Err(DayIndexError::OutOfRange),
            _ => panic!("invalid day-index vector: {}", vector.name),
        };

        assert_eq!(
            day_index(vector.now_seconds),
            expected,
            "vector: {}",
            vector.name
        );
    }
}

#[test]
fn shared_index_for_day_vectors_match() {
    for vector in vectors().index_for_day {
        let expected = match (vector.expected, vector.error.as_deref()) {
            (Some(index), None) => Ok(index),
            (None, Some("empty_series")) => Err(IndexForDayError::EmptySeries),
            (None, Some("before_start")) => Err(IndexForDayError::BeforeStart),
            _ => panic!("invalid index-for-day vector: {}", vector.name),
        };

        assert_eq!(
            index_for_day(vector.day, vector.start_day, vector.count),
            expected,
            "vector: {}",
            vector.name
        );
    }
}

#[test]
fn rejects_pre_epoch_input_instead_of_wrapping() {
    assert_eq!(
        day_index(super::EPOCH_SECONDS - 1),
        Err(DayIndexError::BeforeEpoch)
    );
}

#[test]
fn u64_bitmap_helpers_cover_every_high_bit() {
    let mut bitmap = 0;
    for game_id in 53..=63 {
        bitmap = set_game_bit(bitmap, game_id).expect("bits 53 through 63 must be valid");
    }

    for game_id in 0..53 {
        assert!(!has_game_bit(bitmap, game_id).unwrap(), "game {game_id}");
    }
    for game_id in 53..=63 {
        assert!(has_game_bit(bitmap, game_id).unwrap(), "game {game_id}");
    }
    assert_eq!(bitmap, 0xffe0_0000_0000_0000);
}

#[test]
fn bitmap_helpers_reject_out_of_range_game_ids() {
    for game_id in [64, 65, u8::MAX] {
        assert_eq!(set_game_bit(0, game_id), Err(BitmapError::GameOutOfRange));
        assert_eq!(
            has_game_bit(u64::MAX, game_id),
            Err(BitmapError::GameOutOfRange)
        );
    }
}

#[test]
fn record_rejects_out_of_range_game_id() {
    assert_eq!(
        record_day_bits(DayBitmaps::default(), 64, 10, 10, true),
        Err(RecordError::GameOutOfRange)
    );
}

#[test]
fn record_rejects_future_day() {
    assert_eq!(
        record_day_bits(DayBitmaps::default(), 2, 11, 10, true),
        Err(RecordError::FutureDay)
    );
}

#[test]
fn record_rejects_an_already_played_game_day() {
    let bits = DayBitmaps {
        played: set_game_bit(0, 7).unwrap(),
        solved: 0,
        ontime: 0,
    };

    assert_eq!(
        record_day_bits(bits, 7, 10, 10, false),
        Err(RecordError::AlreadyRecorded)
    );
}

#[test]
fn record_derives_ontime_from_the_recorded_and_current_days() {
    let today = record_day_bits(DayBitmaps::default(), 3, 10, 10, false).unwrap();
    assert!(has_game_bit(today.played, 3).unwrap());
    assert!(has_game_bit(today.ontime, 3).unwrap());
    assert!(!has_game_bit(today.solved, 3).unwrap());

    let backfill = record_day_bits(DayBitmaps::default(), 3, 9, 10, true).unwrap();
    assert!(has_game_bit(backfill.played, 3).unwrap());
    assert!(has_game_bit(backfill.solved, 3).unwrap());
    assert!(!has_game_bit(backfill.ontime, 3).unwrap());
}

#[test]
fn day_batch_bound_allows_64_and_rejects_larger_counts() {
    assert_eq!(validate_day_batch_count(0), Ok(()));
    assert_eq!(validate_day_batch_count(64), Ok(()));
    assert_eq!(validate_day_batch_count(65), Err(DayBatchError::TooLarge));
}

#[test]
fn word_answer_accepts_exactly_six_lowercase_letters() {
    assert_eq!(validate_word_answer("planet"), Ok(()));
}

#[test]
fn word_answer_rejects_every_other_length() {
    // The game is one six-letter word a day (D16): the old 4–8 tier
    // lengths must not slip back in through the contract.
    for word in ["pear", "grape", "apricot", "plantain", ""] {
        assert_eq!(
            validate_word_answer(word),
            Err(WordAnswerError::InvalidWordLength),
            "word {word:?}"
        );
    }
}

#[test]
fn word_answer_rejects_every_non_lowercase_ascii_class() {
    for invalid in ["Planet", "pl4net", "pla-et", "plané"] {
        assert_eq!(
            validate_word_answer(invalid),
            Err(WordAnswerError::NonLowercaseAscii),
            "word {invalid:?}"
        );
    }
}

#[test]
fn word_authoring_batches_are_nonempty_and_capped_at_sixty_four_days() {
    assert_eq!(validate_word_batch_count(0), Err(WordBatchError::Empty));
    assert_eq!(validate_word_batch_count(1), Ok(()));
    assert_eq!(validate_word_batch_count(MAX_WORD_DAYS_PER_BATCH), Ok(()));
    assert_eq!(
        validate_word_batch_count(MAX_WORD_DAYS_PER_BATCH + 1),
        Err(WordBatchError::TooLarge)
    );
}

#[test]
fn word_list_writes_require_the_creator_and_an_unsealed_list() {
    let creator = [7; 20];

    assert_eq!(validate_word_list_write(creator, creator, false), Ok(()));
    assert_eq!(
        validate_word_list_write([8; 20], creator, false),
        Err(WordListWriteError::NotCreator)
    );
    assert_eq!(
        validate_word_list_write(creator, creator, true),
        Err(WordListWriteError::Sealed)
    );
}

#[test]
fn only_sealed_word_lists_are_catalog_visible() {
    assert!(!word_list_is_catalog_visible(false));
    assert!(word_list_is_catalog_visible(true));
}

#[test]
fn word_list_pages_are_nonempty_and_capped_at_twenty_four() {
    assert_eq!(
        validate_word_list_page_limit(0),
        Err(WordListPageError::Empty)
    );
    assert_eq!(validate_word_list_page_limit(1), Ok(()));
    assert_eq!(
        validate_word_list_page_limit(MAX_WORD_LIST_PAGE),
        Ok(())
    );
    assert_eq!(
        validate_word_list_page_limit(MAX_WORD_LIST_PAGE + 1),
        Err(WordListPageError::TooLarge)
    );
}

#[test]
fn a_word_list_must_have_a_word_before_it_can_be_sealed() {
    assert_eq!(
        validate_word_list_sealable(0),
        Err(WordListSealError::Empty)
    );
    assert_eq!(validate_word_list_sealable(1), Ok(()));
}

#[test]
fn word_day_selection_wraps_and_rejects_days_before_launch() {
    assert_eq!(index_for_day(42, 40, 2), Ok(0));
    assert_eq!(index_for_day(43, 40, 2), Ok(1));
    assert_eq!(index_for_day(39, 40, 2), Err(IndexForDayError::BeforeStart));
}

#[test]
fn chess_fen_accepts_structurally_valid_positions_without_claiming_legality() {
    assert_eq!(
        validate_chess_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
        Ok(())
    );
    assert_eq!(
        validate_chess_fen("8/8/8/8/8/8/8/8 b - - 0 1"),
        Ok(()),
        "kingless positions are structurally valid; full legality is out of scope"
    );
}

#[test]
fn chess_fen_requires_exactly_six_nonempty_space_separated_fields() {
    for invalid in [
        "8/8/8/8/8/8/8/8 w - - 0",
        "8/8/8/8/8/8/8/8 w - - 0 1 extra",
        "8/8/8/8/8/8/8/8  w - - 0 1",
        "8/8/8/8/8/8/8/8\tw - - 0 1",
    ] {
        assert_eq!(
            validate_chess_fen(invalid),
            Err(ChessFenError::WrongFieldCount),
            "{invalid:?}"
        );
    }
}

#[test]
fn chess_fen_requires_exactly_eight_ranks() {
    assert_eq!(
        validate_chess_fen("8/8/8/8/8/8/8 w - - 0 1"),
        Err(ChessFenError::WrongRankCount)
    );
    assert_eq!(
        validate_chess_fen("8/8/8/8/8/8/8/8/8 w - - 0 1"),
        Err(ChessFenError::WrongRankCount)
    );
}

#[test]
fn chess_fen_requires_each_rank_to_describe_exactly_eight_squares() {
    for invalid in [
        "7/8/8/8/8/8/8/8 w - - 0 1",
        "9/8/8/8/8/8/8/8 w - - 0 1",
        "4K4/8/8/8/8/8/8/8 w - - 0 1",
        "7x/8/8/8/8/8/8/8 w - - 0 1",
    ] {
        assert_eq!(
            validate_chess_fen(invalid),
            Err(ChessFenError::InvalidRank),
            "{invalid:?}"
        );
    }
}

#[test]
fn chess_fen_requires_a_standard_side_to_move() {
    assert_eq!(
        validate_chess_fen("8/8/8/8/8/8/8/8 x - - 0 1"),
        Err(ChessFenError::InvalidSideToMove)
    );
}

#[test]
fn chess_solution_lines_accept_four_character_moves_and_promotions() {
    assert_eq!(validate_chess_moves("e2e4"), Ok(()));
    assert_eq!(validate_chess_moves("e2e4 e7e8q a7a8n"), Ok(()));
}

#[test]
fn chess_solution_lines_reject_empty_or_non_uci_moves() {
    assert_eq!(validate_chess_moves(""), Err(ChessMovesError::Empty));
    for invalid in [
        "e2e",
        "e2e44",
        "i2e4",
        "e0e4",
        "e7e8k",
        "e7e8Q",
        "e2e4  e7e5",
        "e2e4\te7e5",
    ] {
        assert_eq!(
            validate_chess_moves(invalid),
            Err(ChessMovesError::InvalidMove),
            "{invalid:?}"
        );
    }
}

#[test]
fn chess_authoring_batches_are_nonempty_and_capped_at_eight_puzzles() {
    assert_eq!(
        validate_chess_puzzle_batch_count(0),
        Err(ChessPuzzleBatchError::Empty)
    );
    assert_eq!(validate_chess_puzzle_batch_count(1), Ok(()));
    assert_eq!(
        validate_chess_puzzle_batch_count(MAX_CHESS_PUZZLES_PER_BATCH),
        Ok(())
    );
    assert_eq!(
        validate_chess_puzzle_batch_count(MAX_CHESS_PUZZLES_PER_BATCH + 1),
        Err(ChessPuzzleBatchError::TooLarge)
    );
}

#[test]
fn chess_set_writes_require_the_creator_and_an_unsealed_set() {
    let creator = [7; 20];

    assert_eq!(validate_chess_set_write(creator, creator, false), Ok(()));
    assert_eq!(
        validate_chess_set_write([8; 20], creator, false),
        Err(ChessSetWriteError::NotCreator)
    );
    assert_eq!(
        validate_chess_set_write(creator, creator, true),
        Err(ChessSetWriteError::Sealed)
    );
}

#[test]
fn only_sealed_chess_sets_are_catalog_visible() {
    assert!(!chess_set_is_catalog_visible(false));
    assert!(chess_set_is_catalog_visible(true));
}

#[test]
fn chess_set_pages_are_nonempty_and_capped_at_twenty_four() {
    assert_eq!(
        validate_chess_set_page_limit(0),
        Err(ChessSetPageError::Empty)
    );
    assert_eq!(validate_chess_set_page_limit(1), Ok(()));
    assert_eq!(validate_chess_set_page_limit(MAX_CHESS_SET_PAGE), Ok(()));
    assert_eq!(
        validate_chess_set_page_limit(MAX_CHESS_SET_PAGE + 1),
        Err(ChessSetPageError::TooLarge)
    );
}

#[test]
fn a_chess_set_must_have_a_puzzle_before_it_can_be_sealed() {
    assert_eq!(
        validate_chess_set_sealable(0),
        Err(ChessSetSealError::Empty)
    );
    assert_eq!(validate_chess_set_sealable(1), Ok(()));
}

#[test]
fn chess_day_selection_wraps_and_rejects_days_before_launch() {
    assert_eq!(index_for_day(72, 70, 2), Ok(0));
    assert_eq!(index_for_day(73, 70, 2), Ok(1));
    assert_eq!(index_for_day(69, 70, 2), Err(IndexForDayError::BeforeStart));
}

#[test]
fn month_calendar_and_win_rate_derive_from_day_bitmaps_alone() {
    let mut month = [DayBitmaps::default(); 31];
    for (day, bits) in month.iter_mut().enumerate() {
        if day % 2 == 0 {
            let recorded_day = day as u32;
            let current_day = if day % 6 == 0 {
                recorded_day
            } else {
                recorded_day + 1
            };
            *bits = record_day_bits(*bits, 63, recorded_day, current_day, day % 4 == 0).unwrap();
        }
    }

    let played = month
        .iter()
        .filter(|bits| has_game_bit(bits.played, 63).unwrap())
        .count();
    let solved = month
        .iter()
        .filter(|bits| has_game_bit(bits.solved, 63).unwrap())
        .count();
    let ontime = month
        .iter()
        .filter(|bits| has_game_bit(bits.ontime, 63).unwrap())
        .count();

    assert_eq!((played, solved, ontime), (16, 8, 6));
    assert_eq!(solved * 100 / played, 50);
}

// Corners black: rows of 3,5,5,5,3 letters and the same columns — ten entries.
const MINI_CORNERS: &str = "#ABC#DEFGHIJKLMNOPQR#STU#";

#[test]
fn mini_grid_counts_entries_from_the_black_squares() {
    assert_eq!(
        validate_mini_grid(MINI_CORNERS),
        Ok(MiniShape { across: 5, down: 5 })
    );
    // Two blacks on the diagonal: 4,5,5,5,4 rows and columns.
    assert_eq!(
        validate_mini_grid("#ABCDEFGHIJKLMNOPQRSTUVW#"),
        Ok(MiniShape { across: 5, down: 5 })
    );
    // Five blacks: 3,4,5,4,4 rows; 3,4,5,5,3 columns.
    assert_eq!(
        validate_mini_grid("##ABC#DEFGHIJKLMNOP#QRST#"),
        Ok(MiniShape { across: 5, down: 5 })
    );
}

#[test]
fn mini_grid_rejects_two_letter_entries_and_isolated_squares() {
    // A black in the middle of row 3 splits it into two 2-letter runs.
    assert_eq!(
        validate_mini_grid("#ABC#DEFGHIJ#LMNOPQR#STU#"),
        Err(MiniGridError::ShortEntry)
    );
    // Row 1 holds one isolated letter.
    assert_eq!(
        validate_mini_grid("#A###BCDEFGHIJKLMNOPQRSTU"),
        Err(MiniGridError::ShortEntry)
    );
    // A whole black row would split every column into 2 + 2.
    assert_eq!(
        validate_mini_grid("ABCDEFGHIJ#####KLMNOPQRST"),
        Err(MiniGridError::ShortEntry)
    );
}

#[test]
fn mini_grid_requires_two_to_five_blacks_uppercase_letters_and_25_squares() {
    assert_eq!(
        validate_mini_grid("ABCDEFGHIJKLMNOPQRSTUVWX#"),
        Err(MiniGridError::BlackCount)
    );
    assert_eq!(
        validate_mini_grid("###AB#####KLMNOPQRSTUVWXY"),
        Err(MiniGridError::BlackCount)
    );
    assert_eq!(
        validate_mini_grid("#abc#DEFGHIJKLMNOPQR#STU#"),
        Err(MiniGridError::BadCharacter)
    );
    assert_eq!(
        validate_mini_grid("#AB.#DEFGHIJKLMNOPQR#STU#"),
        Err(MiniGridError::BadCharacter)
    );
    assert_eq!(validate_mini_grid("#ABC#"), Err(MiniGridError::WrongLength));
    assert_eq!(
        validate_mini_grid("#ABC#DEFGHIJKLMNOPQR#STU#X"),
        Err(MiniGridError::WrongLength)
    );
}

#[test]
fn mini_clues_are_nonempty_short_and_printable() {
    assert_eq!(validate_mini_clue("Capital of France"), Ok(()));
    assert_eq!(validate_mini_clue(&"x".repeat(MINI_MAX_CLUE_CHARS)), Ok(()));
    assert_eq!(validate_mini_clue(""), Err(MiniClueError::Empty));
    assert_eq!(
        validate_mini_clue(&"x".repeat(MINI_MAX_CLUE_CHARS + 1)),
        Err(MiniClueError::TooLong)
    );
    // Length counts characters, not bytes: 50 accented letters pass.
    assert_eq!(validate_mini_clue(&"é".repeat(MINI_MAX_CLUE_CHARS)), Ok(()));
    assert_eq!(
        validate_mini_clue("line\nbreak"),
        Err(MiniClueError::ControlCharacter)
    );
}

#[test]
fn mini_puzzle_clue_lists_must_match_the_grid_entry_counts() {
    let five = ["a", "b", "c", "d", "e"];
    assert_eq!(
        validate_mini_puzzle(MINI_CORNERS, &five, &five),
        Ok(MiniShape { across: 5, down: 5 })
    );
    assert_eq!(
        validate_mini_puzzle(MINI_CORNERS, &five[..4], &five),
        Err(MiniPuzzleError::WrongAcrossCount)
    );
    assert_eq!(
        validate_mini_puzzle(MINI_CORNERS, &five, &five[..4]),
        Err(MiniPuzzleError::WrongDownCount)
    );
    assert_eq!(
        validate_mini_puzzle(MINI_CORNERS, &["a", "b", "c", "d", ""], &five),
        Err(MiniPuzzleError::Clue(MiniClueError::Empty))
    );
    assert_eq!(
        validate_mini_puzzle("#ABC#DEFGHIJ#LMNOPQR#STU#", &five, &five),
        Err(MiniPuzzleError::Grid(MiniGridError::ShortEntry))
    );
}

#[test]
fn mini_authoring_batches_are_nonempty_and_capped_at_eight_puzzles() {
    assert_eq!(validate_mini_puzzle_batch_count(0), Err(MiniPuzzleBatchError::Empty));
    assert_eq!(validate_mini_puzzle_batch_count(1), Ok(()));
    assert_eq!(validate_mini_puzzle_batch_count(MAX_MINI_PUZZLES_PER_BATCH), Ok(()));
    assert_eq!(
        validate_mini_puzzle_batch_count(MAX_MINI_PUZZLES_PER_BATCH + 1),
        Err(MiniPuzzleBatchError::TooLarge)
    );
}

#[test]
fn mini_set_writes_require_the_creator_and_an_unsealed_set() {
    let creator = [1u8; 20];
    assert_eq!(validate_mini_set_write(creator, creator, false), Ok(()));
    assert_eq!(
        validate_mini_set_write([2u8; 20], creator, false),
        Err(MiniSetWriteError::NotCreator)
    );
    assert_eq!(
        validate_mini_set_write(creator, creator, true),
        Err(MiniSetWriteError::Sealed)
    );
}

#[test]
fn only_sealed_mini_sets_are_catalog_visible_and_pages_and_seals_are_bounded() {
    assert!(mini_set_is_catalog_visible(true));
    assert!(!mini_set_is_catalog_visible(false));
    assert_eq!(validate_mini_set_page_limit(0), Err(MiniSetPageError::Empty));
    assert_eq!(validate_mini_set_page_limit(MAX_MINI_SET_PAGE), Ok(()));
    assert_eq!(
        validate_mini_set_page_limit(MAX_MINI_SET_PAGE + 1),
        Err(MiniSetPageError::TooLarge)
    );
    assert_eq!(validate_mini_set_sealable(0), Err(MiniSetSealError::Empty));
    assert_eq!(validate_mini_set_sealable(1), Ok(()));
}

// ---- Connections (WP33) ----

struct Group {
    label: &'static str,
    words: [&'static str; 4],
    tier: u8,
}

impl ConnectionsGroup for Group {
    fn label(&self) -> &str {
        self.label
    }
    fn word_count(&self) -> usize {
        self.words.len()
    }
    fn word(&self, index: usize) -> &str {
        self.words[index]
    }
    fn tier(&self) -> u8 {
        self.tier
    }
}

fn sample_puzzle() -> [Group; 4] {
    [
        Group { label: "Things with keys", words: ["Piano", "Keyboard", "Lock", "Map"], tier: 1 },
        Group { label: "Bread", words: ["Roll", "Loaf", "Bun", "Baguette"], tier: 0 },
        Group { label: "Ways to move", words: ["Walk", "Run", "Skip", "Hop"], tier: 2 },
        Group { label: "Ice ___", words: ["Cream", "Cube", "Age", "Berg"], tier: 3 },
    ]
}

#[test]
fn connections_puzzle_accepts_four_distinct_tiered_groups() {
    assert_eq!(validate_connections_puzzle(&sample_puzzle()), Ok(()));
}

#[test]
fn connections_puzzle_requires_exactly_four_groups() {
    let three = &sample_puzzle()[..3];
    assert_eq!(
        validate_connections_puzzle(three),
        Err(ConnectionsPuzzleError::WrongGroupCount)
    );
}

#[test]
fn connections_puzzle_requires_each_tier_exactly_once() {
    let mut puzzle = sample_puzzle();
    puzzle[1].tier = 1;
    assert_eq!(
        validate_connections_puzzle(&puzzle),
        Err(ConnectionsPuzzleError::DuplicateTier)
    );
    let mut puzzle = sample_puzzle();
    puzzle[3].tier = 4;
    assert_eq!(
        validate_connections_puzzle(&puzzle),
        Err(ConnectionsPuzzleError::BadTier)
    );
}

#[test]
fn connections_puzzle_rejects_a_word_used_twice_regardless_of_case() {
    let mut puzzle = sample_puzzle();
    puzzle[2].words[0] = "ROLL";
    assert_eq!(
        validate_connections_puzzle(&puzzle),
        Err(ConnectionsPuzzleError::DuplicateWord)
    );
}

#[test]
fn connections_puzzle_bounds_labels_and_words() {
    let mut puzzle = sample_puzzle();
    puzzle[0].label = "";
    assert_eq!(
        validate_connections_puzzle(&puzzle),
        Err(ConnectionsPuzzleError::EmptyLabel)
    );
    let mut puzzle = sample_puzzle();
    puzzle[0].label = "A label that runs past the forty byte limit";
    assert_eq!(
        validate_connections_puzzle(&puzzle),
        Err(ConnectionsPuzzleError::LabelTooLong)
    );
    let mut puzzle = sample_puzzle();
    puzzle[0].words[0] = " Piano";
    assert_eq!(
        validate_connections_puzzle(&puzzle),
        Err(ConnectionsPuzzleError::BadWord)
    );
    let mut puzzle = sample_puzzle();
    puzzle[0].words[0] = "";
    assert_eq!(
        validate_connections_puzzle(&puzzle),
        Err(ConnectionsPuzzleError::BadWord)
    );
    let mut puzzle = sample_puzzle();
    puzzle[0].words[0] = "abcdefghijklmnopqrstuvwxy";
    assert_eq!(
        validate_connections_puzzle(&puzzle),
        Err(ConnectionsPuzzleError::WordTooLong)
    );
}

#[test]
fn connections_authoring_batches_are_nonempty_and_capped_at_eight_puzzles() {
    assert_eq!(
        validate_connections_puzzle_batch_count(0),
        Err(ConnectionsPuzzleBatchError::Empty)
    );
    assert_eq!(validate_connections_puzzle_batch_count(1), Ok(()));
    assert_eq!(
        validate_connections_puzzle_batch_count(MAX_CONNECTIONS_PUZZLES_PER_BATCH),
        Ok(())
    );
    assert_eq!(
        validate_connections_puzzle_batch_count(MAX_CONNECTIONS_PUZZLES_PER_BATCH + 1),
        Err(ConnectionsPuzzleBatchError::TooLarge)
    );
}

#[test]
fn connections_set_writes_require_the_creator_and_an_unsealed_set() {
    let creator = [7; 20];
    assert_eq!(validate_connections_set_write(creator, creator, false), Ok(()));
    assert_eq!(
        validate_connections_set_write([8; 20], creator, false),
        Err(ConnectionsSetWriteError::NotCreator)
    );
    assert_eq!(
        validate_connections_set_write(creator, creator, true),
        Err(ConnectionsSetWriteError::Sealed)
    );
}

#[test]
fn only_sealed_connections_sets_are_catalog_visible() {
    assert!(!connections_set_is_catalog_visible(false));
    assert!(connections_set_is_catalog_visible(true));
}

#[test]
fn connections_set_pages_are_nonempty_and_capped_at_twenty_four() {
    assert_eq!(
        validate_connections_set_page_limit(0),
        Err(ConnectionsSetPageError::Empty)
    );
    assert_eq!(validate_connections_set_page_limit(MAX_CONNECTIONS_SET_PAGE), Ok(()));
    assert_eq!(
        validate_connections_set_page_limit(MAX_CONNECTIONS_SET_PAGE + 1),
        Err(ConnectionsSetPageError::TooLarge)
    );
}

#[test]
fn a_connections_set_must_have_a_puzzle_before_it_can_be_sealed() {
    assert_eq!(
        validate_connections_set_sealable(0),
        Err(ConnectionsSetSealError::Empty)
    );
    assert_eq!(validate_connections_set_sealable(1), Ok(()));
}

mod histogram {
    use crate::{
        better_count, histogram_bucket_for_record, score_bucket, top_percent, GameKind,
        COUNT_BUCKET_MAX, GAME_KIND_COUNT, GAME_KIND_SECONDS, SECONDS_BUCKET_MAX,
    };

    #[test]
    fn game_kinds_round_trip_through_their_storage_byte() {
        assert_eq!(GameKind::from_u8(GAME_KIND_COUNT), Some(GameKind::Count));
        assert_eq!(GameKind::from_u8(GAME_KIND_SECONDS), Some(GameKind::Seconds));
        assert_eq!(GameKind::from_u8(2), None);
        assert_eq!(GameKind::Count.to_u8(), GAME_KIND_COUNT);
        assert_eq!(GameKind::Seconds.to_u8(), GAME_KIND_SECONDS);
    }

    #[test]
    fn count_scores_bucket_exactly_from_1_to_30_and_31_plus() {
        for score in 1..=30u32 {
            assert_eq!(score_bucket(GameKind::Count, score), score as u8, "score {score}");
        }
        assert_eq!(score_bucket(GameKind::Count, 31), COUNT_BUCKET_MAX);
        assert_eq!(score_bucket(GameKind::Count, 400), COUNT_BUCKET_MAX);
        assert_eq!(score_bucket(GameKind::Count, u32::MAX), COUNT_BUCKET_MAX);
        assert_eq!(score_bucket(GameKind::Count, 0), 1, "a finish takes at least one guess");
        assert_eq!(GameKind::Count.bucket_max(), 31);
    }

    #[test]
    fn seconds_bucket_in_fifteen_second_steps_up_to_thirty_minutes() {
        assert_eq!(score_bucket(GameKind::Seconds, 0), 0);
        assert_eq!(score_bucket(GameKind::Seconds, 14), 0);
        assert_eq!(score_bucket(GameKind::Seconds, 15), 1);
        assert_eq!(score_bucket(GameKind::Seconds, 201), 13);
        assert_eq!(score_bucket(GameKind::Seconds, 1799), 119);
        assert_eq!(score_bucket(GameKind::Seconds, 1800), SECONDS_BUCKET_MAX);
        assert_eq!(score_bucket(GameKind::Seconds, u32::MAX), SECONDS_BUCKET_MAX);
        assert_eq!(GameKind::Seconds.bucket_max(), 120);
    }

    #[test]
    fn only_on_time_solved_records_enter_the_histogram() {
        assert_eq!(
            histogram_bucket_for_record(GameKind::Count, 4, 10, 10, true),
            Some(4)
        );
        assert_eq!(
            histogram_bucket_for_record(GameKind::Count, 4, 9, 10, true),
            None,
            "a backfilled day is counted for completion, never in the day's distribution"
        );
        assert_eq!(
            histogram_bucket_for_record(GameKind::Count, 4, 10, 10, false),
            None,
            "the distribution is of finishers"
        );
    }

    #[test]
    fn better_count_sums_strictly_lower_buckets_only() {
        let buckets = [(2u8, 3u32), (4, 5), (5, 1), (31, 2)];
        assert_eq!(better_count(&buckets, 1), 0);
        assert_eq!(better_count(&buckets, 4), 3, "ties are not better");
        assert_eq!(better_count(&buckets, 5), 8);
        assert_eq!(better_count(&buckets, 31), 9);
        assert_eq!(better_count(&[], 7), 0);
        assert_eq!(better_count(&[(1, u32::MAX), (2, 5)], 3), u32::MAX);
    }

    #[test]
    fn top_percent_is_the_rank_share_rounded_with_ties_in_the_players_favour() {
        assert_eq!(top_percent(0, 0), None, "nobody to rank against");
        assert_eq!(top_percent(1, 0), Some(100), "the only finisher");
        assert_eq!(top_percent(2, 0), Some(50));
        assert_eq!(top_percent(2, 1), Some(100));
        assert_eq!(top_percent(3, 0), Some(33));
        assert_eq!(top_percent(3, 1), Some(67));
        assert_eq!(top_percent(200, 0), Some(1), "never below 1");
        assert_eq!(top_percent(1000, 0), Some(1));
        assert_eq!(top_percent(1000, 999), Some(100));
        assert_eq!(top_percent(4, 4), None, "more better finishers than finishers");
    }
}

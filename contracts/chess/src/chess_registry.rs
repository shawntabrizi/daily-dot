//! Chess puzzle-set registry. Each puzzle stores a FEN position and its
//! complete UCI solution line so a client needs one bounded daily read.

#![no_main]
#![no_std]

// The contract macro emits `extern crate alloc` and imports `Vec` at file
// scope, so only import the other allocation-backed type here.
use alloc::string::String;

use daily_on_dot_logic as logic;
use pvm::{Decode, Encode, HostFn};
use pvm_contract as pvm;

/// `get_sets` uses this cursor for its first, newest page. Zero is the
/// terminal cursor returned after the oldest sealed set.
const SET_CURSOR_LATEST: u32 = u32::MAX;

#[derive(Encode, Decode, Clone)]
struct SetMeta {
    creator: [u8; 20],
    name: String,
    emoji: String,
    puzzle_count: u32,
    start_day: u32,
    sealed: bool,
}

#[derive(Encode, Decode, Clone)]
struct Puzzle {
    fen: String,
    moves: String,
}

#[derive(pvm::SolAbi)]
struct PuzzleInput {
    fen: String,
    moves: String,
}

#[derive(pvm::SolAbi)]
struct SetView {
    set_id: u32,
    creator: pvm::Address,
    name: String,
    emoji: String,
    puzzle_count: u32,
    start_day: u32,
    sealed: bool,
}

/// Newest-first sealed-set page. `next_cursor == 0` means there are no older
/// sets; the first request uses `u32::MAX`.
#[derive(pvm::SolAbi)]
struct SetPage {
    sets: alloc::vec::Vec<SetView>,
    next_cursor: u32,
}

#[derive(pvm::SolAbi)]
struct PuzzleView {
    fen: String,
    moves: String,
}

#[pvm::storage]
struct Storage {
    set_count: u32,
    set_meta: pvm::storage::Mapping<u32, SetMeta>,
    puzzles: pvm::storage::Mapping<(u32, u32), Puzzle>,
    // (creator, client-selected nonce) → set id
    created_set_of: pvm::storage::Mapping<([u8; 20], u64), u32>,
    // Draft IDs never enter this append-only catalog index.
    sealed_set_count: u32,
    sealed_set_at: pvm::storage::Mapping<u32, u32>,
}

fn fail(msg: &str) -> ! {
    pvm::api::return_value(pvm::ReturnFlags::REVERT, msg.as_bytes())
}

fn caller20() -> [u8; 20] {
    let mut account = [0u8; 20];
    pvm::api::caller(&mut account);
    account
}

fn stored_set(set_id: u32) -> SetMeta {
    match Storage::set_meta().get(&set_id) {
        Some(meta) => meta,
        None => fail("NoSuchSet"),
    }
}

fn editable_set(set_id: u32) -> SetMeta {
    let meta = stored_set(set_id);
    match logic::validate_chess_set_write(caller20(), meta.creator, meta.sealed) {
        Ok(()) => meta,
        Err(logic::ChessSetWriteError::NotCreator) => fail("NotSetCreator"),
        Err(logic::ChessSetWriteError::Sealed) => fail("SetSealed"),
    }
}

fn set_view(set_id: u32) -> SetView {
    let meta = stored_set(set_id);
    SetView {
        set_id,
        creator: pvm::Address::from(meta.creator),
        name: meta.name,
        emoji: meta.emoji,
        puzzle_count: meta.puzzle_count,
        start_day: meta.start_day,
        sealed: meta.sealed,
    }
}

fn sealed_set_view(set_id: u32) -> SetView {
    let view = set_view(set_id);
    if !logic::chess_set_is_catalog_visible(view.sealed) {
        fail("SealedIndexCorrupt");
    }
    view
}

fn puzzle_view(set_id: u32, index: u32, puzzle_count: u32) -> PuzzleView {
    if index >= puzzle_count {
        fail("NoSuchPuzzle");
    }
    match Storage::puzzles().get(&(set_id, index)) {
        Some(puzzle) => PuzzleView {
            fen: puzzle.fen,
            moves: puzzle.moves,
        },
        None => fail("PuzzleCorrupt"),
    }
}

#[pvm::contract]
mod chess_registry {
    use super::{
        Puzzle, PuzzleInput, PuzzleView, SET_CURSOR_LATEST, SetMeta, SetPage, SetView, Storage,
        caller20, editable_set, fail, logic, puzzle_view, pvm, sealed_set_view, set_view,
        stored_set,
    };
    use alloc::string::String;
    use alloc::vec::Vec;

    #[pvm::constructor]
    pub fn new() -> Result<(), Error> {
        Storage::set_count().set(&0);
        Storage::sealed_set_count().set(&0);
        Ok(())
    }

    #[pvm::method]
    pub fn create_set_with_nonce(name: String, emoji: String, start_day: u32, creation_nonce: u64) {
        let creator = caller20();
        if Storage::created_set_of().contains(&(creator, creation_nonce)) {
            fail("CreationNonceUsed");
        }
        let set_id = Storage::set_count().get().unwrap_or(0);
        let next_set_id = match set_id.checked_add(1) {
            Some(next) => next,
            None => fail("SetIdExhausted"),
        };
        Storage::set_meta().insert(
            &set_id,
            &SetMeta {
                creator,
                name,
                emoji,
                puzzle_count: 0,
                start_day,
                sealed: false,
            },
        );
        Storage::created_set_of().insert(&(creator, creation_nonce), &set_id);
        Storage::set_count().set(&next_set_id);
    }

    /// Resolve a set created with `create_set_with_nonce`; `u32::MAX` means
    /// the creator/nonce pair has not been used.
    #[pvm::method]
    pub fn get_set_for_creation(who: pvm::Address, creation_nonce: u64) -> u32 {
        Storage::created_set_of()
            .get(&(who.to_fixed_bytes(), creation_nonce))
            .unwrap_or(u32::MAX)
    }

    /// Append one nonempty authoring chunk. The bounded batch keeps large
    /// imports resumable through `get_set.puzzle_count`.
    #[pvm::method]
    pub fn add_puzzles(set_id: u32, puzzles: Vec<PuzzleInput>) {
        match logic::validate_chess_puzzle_batch_count(puzzles.len()) {
            Ok(()) => {}
            Err(logic::ChessPuzzleBatchError::Empty) => fail("EmptyBatch"),
            Err(logic::ChessPuzzleBatchError::TooLarge) => fail("BatchTooLarge"),
        }

        let mut meta = editable_set(set_id);
        for puzzle in &puzzles {
            match logic::validate_chess_fen(&puzzle.fen) {
                Ok(()) => {}
                Err(logic::ChessFenError::WrongFieldCount) => fail("BadFenFields"),
                Err(logic::ChessFenError::WrongRankCount) => fail("BadFenRanks"),
                Err(logic::ChessFenError::InvalidRank) => fail("BadFenBoard"),
                Err(logic::ChessFenError::InvalidSideToMove) => fail("BadFenSide"),
            }
            match logic::validate_chess_moves(&puzzle.moves) {
                Ok(()) => {}
                Err(logic::ChessMovesError::Empty) => fail("EmptyMoves"),
                Err(logic::ChessMovesError::InvalidMove) => fail("BadMoves"),
            }
        }

        let added = puzzles.len() as u32;
        let next_puzzle_count = match meta.puzzle_count.checked_add(added) {
            Some(next) => next,
            None => fail("PuzzleCountExhausted"),
        };
        let first_index = meta.puzzle_count;
        for (offset, puzzle) in puzzles.into_iter().enumerate() {
            let index = first_index + offset as u32;
            Storage::puzzles().insert(
                &(set_id, index),
                &Puzzle {
                    fen: puzzle.fen,
                    moves: puzzle.moves,
                },
            );
        }
        meta.puzzle_count = next_puzzle_count;
        Storage::set_meta().insert(&set_id, &meta);
    }

    #[pvm::method]
    pub fn seal_set(set_id: u32) {
        let mut meta = editable_set(set_id);
        if logic::validate_chess_set_sealable(meta.puzzle_count).is_err() {
            fail("EmptySet");
        }

        let sequence = Storage::sealed_set_count().get().unwrap_or(0);
        let next_sequence = match sequence.checked_add(1) {
            Some(next) => next,
            None => fail("SealedSetIndexExhausted"),
        };
        meta.sealed = true;
        Storage::set_meta().insert(&set_id, &meta);
        Storage::sealed_set_at().insert(&sequence, &set_id);
        Storage::sealed_set_count().set(&next_sequence);
    }

    #[pvm::method]
    pub fn get_set(set_id: u32) -> SetView {
        set_view(set_id)
    }

    /// A bounded newest-first catalog page containing sealed sets only.
    /// Pass `u32::MAX` for the first page and each returned nonzero
    /// `next_cursor` for the following page.
    #[pvm::method]
    pub fn get_sets(cursor: u32, limit: u8) -> SetPage {
        if logic::validate_chess_set_page_limit(limit).is_err() {
            fail("BadViewLimit");
        }

        let sealed_count = Storage::sealed_set_count().get().unwrap_or(0);
        let mut upper_exclusive = if cursor == SET_CURSOR_LATEST {
            sealed_count
        } else {
            if cursor > sealed_count {
                fail("BadSetCursor");
            }
            cursor
        };

        let limit = limit as usize;
        let mut sets = Vec::with_capacity(core::cmp::min(limit, upper_exclusive as usize));
        while upper_exclusive > 0 && sets.len() < limit {
            upper_exclusive -= 1;
            let set_id = match Storage::sealed_set_at().get(&upper_exclusive) {
                Some(set_id) => set_id,
                None => fail("SealedIndexCorrupt"),
            };
            sets.push(sealed_set_view(set_id));
        }

        SetPage {
            sets,
            next_cursor: upper_exclusive,
        }
    }

    #[pvm::method]
    pub fn get_puzzle(set_id: u32, index: u32) -> PuzzleView {
        let meta = stored_set(set_id);
        puzzle_view(set_id, index, meta.puzzle_count)
    }

    /// Return the FEN and complete UCI solution line needed for one game-day
    /// read. A day before the set's launch reverts with `BeforeSetStart`.
    #[pvm::method]
    pub fn puzzle_for_day(set_id: u32, day: u32) -> PuzzleView {
        let meta = stored_set(set_id);
        let index = match logic::index_for_day(day, meta.start_day, meta.puzzle_count) {
            Ok(index) => index,
            Err(logic::IndexForDayError::EmptySeries) => fail("EmptySet"),
            Err(logic::IndexForDayError::BeforeStart) => fail("BeforeSetStart"),
        };
        puzzle_view(set_id, index, meta.puzzle_count)
    }
}

//! Word answer-list registry. Each list stores one six-letter answer per day
//! so a client fetches the whole game-day in one bounded chain read.

#![no_main]
#![no_std]

// The contract macro emits `extern crate alloc` and imports `Vec` at file
// scope, so only import the other allocation-backed type here.
use alloc::string::String;

use daily_on_dot_logic as logic;
use pvm::{Decode, Encode, HostFn};
use pvm_contract as pvm;

/// `get_lists` uses this cursor for its first, newest page. Zero is the
/// terminal cursor returned after the oldest sealed list.
const LIST_CURSOR_LATEST: u32 = u32::MAX;

#[derive(Encode, Decode, Clone)]
struct ListMeta {
    creator: [u8; 20],
    name: String,
    emoji: String,
    day_count: u32,
    start_day: u32,
    sealed: bool,
}

#[derive(pvm::SolAbi)]
struct ListView {
    list_id: u32,
    creator: pvm::Address,
    name: String,
    emoji: String,
    day_count: u32,
    start_day: u32,
    sealed: bool,
}

/// Newest-first sealed-list page. `next_cursor == 0` means there are no older
/// lists; the first request uses `u32::MAX`.
#[derive(pvm::SolAbi)]
struct ListPage {
    lists: alloc::vec::Vec<ListView>,
    next_cursor: u32,
}

#[pvm::storage]
struct Storage {
    list_count: u32,
    list_meta: pvm::storage::Mapping<u32, ListMeta>,
    // (list, day index) → the day's lowercase six-letter answer
    words: pvm::storage::Mapping<(u32, u32), String>,
    // (creator, client-selected nonce) → list id
    created_list_of: pvm::storage::Mapping<([u8; 20], u64), u32>,
    // Draft IDs never enter this append-only catalog index.
    sealed_list_count: u32,
    sealed_list_at: pvm::storage::Mapping<u32, u32>,
}

fn fail(msg: &str) -> ! {
    pvm::api::return_value(pvm::ReturnFlags::REVERT, msg.as_bytes())
}

fn caller20() -> [u8; 20] {
    let mut account = [0u8; 20];
    pvm::api::caller(&mut account);
    account
}

fn stored_list(list_id: u32) -> ListMeta {
    match Storage::list_meta().get(&list_id) {
        Some(meta) => meta,
        None => fail("NoSuchList"),
    }
}

fn editable_list(list_id: u32) -> ListMeta {
    let meta = stored_list(list_id);
    match logic::validate_word_list_write(caller20(), meta.creator, meta.sealed) {
        Ok(()) => meta,
        Err(logic::WordListWriteError::NotCreator) => fail("NotListCreator"),
        Err(logic::WordListWriteError::Sealed) => fail("ListSealed"),
    }
}

fn list_view(list_id: u32) -> ListView {
    let meta = stored_list(list_id);
    ListView {
        list_id,
        creator: pvm::Address::from(meta.creator),
        name: meta.name,
        emoji: meta.emoji,
        day_count: meta.day_count,
        start_day: meta.start_day,
        sealed: meta.sealed,
    }
}

fn sealed_list_view(list_id: u32) -> ListView {
    let view = list_view(list_id);
    if !logic::word_list_is_catalog_visible(view.sealed) {
        fail("SealedIndexCorrupt");
    }
    view
}

fn word_view(list_id: u32, index: u32, day_count: u32) -> String {
    if index >= day_count {
        fail("NoSuchWord");
    }
    match Storage::words().get(&(list_id, index)) {
        Some(word) => word,
        None => fail("WordCorrupt"),
    }
}

#[pvm::contract]
mod word_registry {
    use super::{
        LIST_CURSOR_LATEST, ListMeta, ListPage, ListView, Storage, caller20, editable_list, fail,
        list_view, logic, pvm, sealed_list_view, stored_list, word_view,
    };
    use alloc::string::String;
    use alloc::vec::Vec;

    #[pvm::constructor]
    pub fn new() -> Result<(), Error> {
        Storage::list_count().set(&0);
        Storage::sealed_list_count().set(&0);
        Ok(())
    }

    #[pvm::method]
    pub fn create_list_with_nonce(
        name: String,
        emoji: String,
        start_day: u32,
        creation_nonce: u64,
    ) {
        let creator = caller20();
        if Storage::created_list_of().contains(&(creator, creation_nonce)) {
            fail("CreationNonceUsed");
        }
        let list_id = Storage::list_count().get().unwrap_or(0);
        let next_list_id = match list_id.checked_add(1) {
            Some(next) => next,
            None => fail("ListIdExhausted"),
        };
        Storage::list_meta().insert(
            &list_id,
            &ListMeta {
                creator,
                name,
                emoji,
                day_count: 0,
                start_day,
                sealed: false,
            },
        );
        Storage::created_list_of().insert(&(creator, creation_nonce), &list_id);
        Storage::list_count().set(&next_list_id);
    }

    /// Resolve a list created with `create_list_with_nonce`; `u32::MAX`
    /// means the creator/nonce pair has not been used.
    #[pvm::method]
    pub fn get_list_for_creation(who: pvm::Address, creation_nonce: u64) -> u32 {
        Storage::created_list_of()
            .get(&(who.to_fixed_bytes(), creation_nonce))
            .unwrap_or(u32::MAX)
    }

    /// Append one nonempty authoring chunk: up to 64 consecutive days, one
    /// six-letter word each (384 answer bytes before ABI overhead), resumable
    /// through `get_list.day_count`.
    #[pvm::method]
    pub fn add_days(list_id: u32, words: Vec<String>) {
        match logic::validate_word_batch_count(words.len()) {
            Ok(()) => {}
            Err(logic::WordBatchError::Empty) => fail("EmptyBatch"),
            Err(logic::WordBatchError::TooLarge) => fail("BatchTooLarge"),
        }

        let mut meta = editable_list(list_id);
        for word in &words {
            match logic::validate_word_answer(word) {
                Ok(()) => {}
                Err(logic::WordAnswerError::InvalidWordLength) => fail("BadWordLength"),
                Err(logic::WordAnswerError::NonLowercaseAscii) => fail("BadWord"),
            }
        }

        let added = words.len() as u32;
        let next_day_count = match meta.day_count.checked_add(added) {
            Some(next) => next,
            None => fail("DayCountExhausted"),
        };
        let first_day_index = meta.day_count;
        for (offset, word) in words.into_iter().enumerate() {
            Storage::words().insert(&(list_id, first_day_index + offset as u32), &word);
        }
        meta.day_count = next_day_count;
        Storage::list_meta().insert(&list_id, &meta);
    }

    #[pvm::method]
    pub fn seal_list(list_id: u32) {
        let mut meta = editable_list(list_id);
        if logic::validate_word_list_sealable(meta.day_count).is_err() {
            fail("EmptyList");
        }

        let sequence = Storage::sealed_list_count().get().unwrap_or(0);
        let next_sequence = match sequence.checked_add(1) {
            Some(next) => next,
            None => fail("SealedListIndexExhausted"),
        };
        meta.sealed = true;
        Storage::list_meta().insert(&list_id, &meta);
        Storage::sealed_list_at().insert(&sequence, &list_id);
        Storage::sealed_list_count().set(&next_sequence);
    }

    #[pvm::method]
    pub fn get_list(list_id: u32) -> ListView {
        list_view(list_id)
    }

    /// A bounded newest-first catalog page containing sealed lists only.
    /// Pass `u32::MAX` for the first page and each returned nonzero
    /// `next_cursor` for the following page.
    #[pvm::method]
    pub fn get_lists(cursor: u32, limit: u8) -> ListPage {
        if logic::validate_word_list_page_limit(limit).is_err() {
            fail("BadViewLimit");
        }

        let sealed_count = Storage::sealed_list_count().get().unwrap_or(0);
        let mut upper_exclusive = if cursor == LIST_CURSOR_LATEST {
            sealed_count
        } else {
            if cursor > sealed_count {
                fail("BadListCursor");
            }
            cursor
        };

        let limit = limit as usize;
        let mut lists = Vec::with_capacity(core::cmp::min(limit, upper_exclusive as usize));
        while upper_exclusive > 0 && lists.len() < limit {
            upper_exclusive -= 1;
            let list_id = match Storage::sealed_list_at().get(&upper_exclusive) {
                Some(list_id) => list_id,
                None => fail("SealedIndexCorrupt"),
            };
            lists.push(sealed_list_view(list_id));
        }

        ListPage {
            lists,
            next_cursor: upper_exclusive,
        }
    }

    #[pvm::method]
    pub fn get_word(list_id: u32, index: u32) -> String {
        let meta = stored_list(list_id);
        word_view(list_id, index, meta.day_count)
    }

    /// The day's answer, the one read a game-day needs. A day before the
    /// list's launch reverts with `BeforeListStart`.
    #[pvm::method]
    pub fn word_for_day(list_id: u32, day: u32) -> String {
        let meta = stored_list(list_id);
        let index = match logic::index_for_day(day, meta.start_day, meta.day_count) {
            Ok(index) => index,
            Err(logic::IndexForDayError::EmptySeries) => fail("EmptyList"),
            Err(logic::IndexForDayError::BeforeStart) => fail("BeforeListStart"),
        };
        word_view(list_id, index, meta.day_count)
    }
}

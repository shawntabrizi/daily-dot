#![no_main]
#![no_std]

use daily_on_dot_logic as logic;
use pvm::{Decode, Encode, HostFn};
use pvm_contract as pvm;

#[derive(Encode, Decode, Clone)]
struct Detail {
    score: u32,
    solved: bool,
}

#[derive(pvm::SolAbi)]
struct DayBits {
    played: u64,
    solved: u64,
    ontime: u64,
}

#[derive(pvm::SolAbi)]
struct DetailView {
    score: u32,
    solved: bool,
}

/// One non-empty histogram bucket: `bucket` is the exact count (1..=31, 31 =
/// "31+") for Count games or the 15-second step (0..=120, 120 = "30 min+")
/// for Seconds games; `count` is how many on-time finishers landed in it.
#[derive(pvm::SolAbi)]
struct BucketCount {
    bucket: u8,
    count: u32,
}

/// A `(game_id, day)` distribution: `total` on-time finishers and the
/// non-empty buckets in ascending bucket order.
#[derive(pvm::SolAbi)]
struct HistogramView {
    total: u32,
    buckets: alloc::vec::Vec<BucketCount>,
}

#[pvm::storage]
struct Storage {
    played_bits: pvm::storage::Mapping<([u8; 20], u32), u64>,
    solved_bits: pvm::storage::Mapping<([u8; 20], u32), u64>,
    ontime_bits: pvm::storage::Mapping<([u8; 20], u32), u64>,
    detail: pvm::storage::Mapping<([u8; 20], u32, u8), Detail>,
    /// The deployer; the only account that may set a game's kind.
    owner: [u8; 20],
    /// `game_id -> GameKind` byte; unset reads as Count.
    game_kind: pvm::storage::Mapping<u8, u8>,
    /// `(game_id, day, bucket) -> count` of on-time finishers (D20).
    bucket_count: pvm::storage::Mapping<(u8, u32, u8), u32>,
    /// `(game_id, day) -> total` on-time finishers.
    bucket_total: pvm::storage::Mapping<(u8, u32), u32>,
}

fn fail(msg: &str) -> ! {
    pvm::api::return_value(pvm::ReturnFlags::REVERT, msg.as_bytes())
}

fn caller20() -> [u8; 20] {
    let mut account = [0u8; 20];
    pvm::api::caller(&mut account);
    account
}

fn current_day_index() -> u32 {
    let mut raw = [0u8; 32];
    pvm::api::now(&mut raw);
    let mut seconds = [0u8; 8];
    seconds.copy_from_slice(&raw[..8]);
    match logic::day_index(u64::from_le_bytes(seconds)) {
        Ok(day) => day,
        Err(_) => fail("InvalidBlockTimestamp"),
    }
}

fn stored_day_bits(who: [u8; 20], day: u32) -> logic::DayBitmaps {
    let key = (who, day);
    logic::DayBitmaps {
        played: Storage::played_bits().get(&key).unwrap_or(0),
        solved: Storage::solved_bits().get(&key).unwrap_or(0),
        ontime: Storage::ontime_bits().get(&key).unwrap_or(0),
    }
}

fn day_view(who: [u8; 20], day: u32) -> DayBits {
    let bits = stored_day_bits(who, day);
    DayBits {
        played: bits.played,
        solved: bits.solved,
        ontime: bits.ontime,
    }
}

fn stored_game_kind(game_id: u8) -> logic::GameKind {
    Storage::game_kind()
        .get(&game_id)
        .and_then(logic::GameKind::from_u8)
        .unwrap_or(logic::GameKind::Count)
}

fn histogram_view(game_id: u8, day: u32) -> HistogramView {
    if game_id >= logic::GAME_COUNT {
        fail("GameOutOfRange");
    }
    let kind = stored_game_kind(game_id);
    let total = Storage::bucket_total().get(&(game_id, day)).unwrap_or(0);
    let mut buckets = alloc::vec::Vec::new();
    if total > 0 {
        for bucket in 0..=kind.bucket_max() {
            if let Some(count) = Storage::bucket_count().get(&(game_id, day, bucket)) {
                if count > 0 {
                    buckets.push(BucketCount { bucket, count });
                }
            }
        }
    }
    HistogramView { total, buckets }
}

fn detail_view(who: [u8; 20], day: u32, game_id: u8) -> Option<DetailView> {
    Storage::detail()
        .get(&(who, day, game_id))
        .map(|detail| DetailView {
            score: detail.score,
            solved: detail.solved,
        })
}

#[pvm::contract]
mod daily_scores {
    use super::{
        DayBits, Detail, DetailView, HistogramView, Storage, caller20, current_day_index,
        day_view, detail_view, fail, histogram_view, logic, pvm, stored_day_bits,
        stored_game_kind,
    };
    use alloc::vec::Vec;

    #[pvm::constructor]
    pub fn new() -> Result<(), Error> {
        Storage::owner().set(&caller20());
        Ok(())
    }

    /// Owner only. `kind` is `GAME_KIND_COUNT` (0) or `GAME_KIND_SECONDS`
    /// (1); an unset game reads as Count. Changing a kind after a day has
    /// recorded re-labels that day's buckets, so set kinds before launch.
    #[pvm::method]
    pub fn set_game_kind(game_id: u8, kind: u8) {
        if Storage::owner().get() != Some(caller20()) {
            fail("NotOwner");
        }
        if game_id >= logic::GAME_COUNT {
            fail("GameOutOfRange");
        }
        if logic::GameKind::from_u8(kind).is_none() {
            fail("InvalidKind");
        }
        Storage::game_kind().insert(&game_id, &kind);
    }

    #[pvm::method]
    pub fn game_kind(game_id: u8) -> u8 {
        if game_id >= logic::GAME_COUNT {
            fail("GameOutOfRange");
        }
        stored_game_kind(game_id).to_u8()
    }

    #[pvm::method]
    pub fn owner() -> pvm::Address {
        pvm::Address::from(Storage::owner().get().unwrap_or([0u8; 20]))
    }

    #[pvm::method]
    pub fn record(game_id: u8, day: u32, score: u32, solved: bool) {
        let who = caller20();
        let current_day = current_day_index();
        let updated = match logic::record_day_bits(
            stored_day_bits(who, day),
            game_id,
            day,
            current_day,
            solved,
        ) {
            Ok(bits) => bits,
            Err(logic::RecordError::GameOutOfRange) => fail("GameOutOfRange"),
            Err(logic::RecordError::FutureDay) => fail("FutureDay"),
            Err(logic::RecordError::AlreadyRecorded) => fail("AlreadyRecorded"),
        };
        let day_key = (who, day);
        Storage::played_bits().insert(&day_key, &updated.played);
        Storage::solved_bits().insert(&day_key, &updated.solved);
        Storage::ontime_bits().insert(&day_key, &updated.ontime);
        Storage::detail().insert(&(who, day, game_id), &Detail { score, solved });

        // The day's distribution counts on-time finishers only (D20): a
        // backfill sees it and never changes it.
        if let Some(bucket) = logic::histogram_bucket_for_record(
            stored_game_kind(game_id),
            score,
            day,
            current_day,
            solved,
        ) {
            let bucket_key = (game_id, day, bucket);
            let count = Storage::bucket_count().get(&bucket_key).unwrap_or(0);
            Storage::bucket_count().insert(&bucket_key, &count.saturating_add(1));
            let total = Storage::bucket_total().get(&(game_id, day)).unwrap_or(0);
            Storage::bucket_total().insert(&(game_id, day), &total.saturating_add(1));
        }
    }

    #[pvm::method]
    pub fn current_day() -> u32 {
        current_day_index()
    }

    #[pvm::method]
    pub fn get_day(who: pvm::Address, day: u32) -> DayBits {
        day_view(who.to_fixed_bytes(), day)
    }

    #[pvm::method]
    pub fn get_days(who: pvm::Address, from_day: u32, count: u8) -> Vec<DayBits> {
        if logic::validate_day_batch_count(count).is_err() {
            fail("ViewBatchTooLarge");
        }
        let who = who.to_fixed_bytes();
        let mut days = Vec::with_capacity(count as usize);
        for offset in 0..count {
            let day = match from_day.checked_add(offset as u32) {
                Some(day) => day,
                None => fail("DayRangeOverflow"),
            };
            days.push(day_view(who, day));
        }
        days
    }

    #[pvm::method]
    pub fn get_detail(who: pvm::Address, day: u32, game_id: u8) -> DetailView {
        if game_id >= logic::GAME_COUNT {
            fail("GameOutOfRange");
        }
        match detail_view(who.to_fixed_bytes(), day, game_id) {
            Some(detail) => detail,
            None => fail("NoDetail"),
        }
    }

    /// Details for several games of one day in one read. A game the account
    /// has not recorded for that day comes back as `{score: 0, solved: false}`;
    /// callers tell the two apart with `get_day`'s `played` bit.
    #[pvm::method]
    pub fn get_details(who: pvm::Address, day: u32, game_ids: Vec<u8>) -> Vec<DetailView> {
        if game_ids.len() > logic::GAME_COUNT as usize {
            fail("ViewBatchTooLarge");
        }
        let who = who.to_fixed_bytes();
        let mut details = Vec::with_capacity(game_ids.len());
        for game_id in game_ids {
            if game_id >= logic::GAME_COUNT {
                fail("GameOutOfRange");
            }
            details.push(detail_view(who, day, game_id).unwrap_or(DetailView {
                score: 0,
                solved: false,
            }));
        }
        details
    }

    /// The day's distribution for one game: on-time finishers per bucket.
    #[pvm::method]
    pub fn histogram(game_id: u8, day: u32) -> HistogramView {
        histogram_view(game_id, day)
    }

    /// One read for a day summary: the distribution of every listed game.
    #[pvm::method]
    pub fn histograms(day: u32, game_ids: Vec<u8>) -> Vec<HistogramView> {
        if game_ids.len() > logic::GAME_COUNT as usize {
            fail("ViewBatchTooLarge");
        }
        let mut views = Vec::with_capacity(game_ids.len());
        for game_id in game_ids {
            views.push(histogram_view(game_id, day));
        }
        views
    }

    /// On-time finisher totals per listed game, without the buckets.
    #[pvm::method]
    pub fn day_totals(day: u32, game_ids: Vec<u8>) -> Vec<u32> {
        if game_ids.len() > logic::GAME_COUNT as usize {
            fail("ViewBatchTooLarge");
        }
        let mut totals = Vec::with_capacity(game_ids.len());
        for game_id in game_ids {
            if game_id >= logic::GAME_COUNT {
                fail("GameOutOfRange");
            }
            totals.push(Storage::bucket_total().get(&(game_id, day)).unwrap_or(0));
        }
        totals
    }
}
